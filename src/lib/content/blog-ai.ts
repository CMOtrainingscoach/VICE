import OpenAI from "openai";
import { z } from "zod";
import { resolveBlogImageModel, resolveBlogTextModel } from "@/lib/openai/models";
import type { BlogLength, BlogMode } from "@/lib/content/blog-types";

const blogResultSchema = z.object({
  title: z.string().min(1),
  bodyHtml: z.string().min(1),
});

export type BlogAiResult = z.infer<typeof blogResultSchema>;

const LENGTH_HINT: Record<BlogLength, string> = {
  short: "richtlijn: ongeveer 400-600 woorden",
  medium: "richtlijn: ongeveer 700-1000 woorden",
  long: "richtlijn: ongeveer 1200-1600 woorden",
};

function systemRules(voice: string, language: string): string {
  const isDutch = language !== "en";
  return [
    "Je schrijft blogs voor VICE, een strategisch platform.",
    isDutch
      ? [
          "Schrijf in het Nederlands met Belgische spelling en woordenschat.",
          "Volg de officiële Nederlandse spelling zoals in België gebruikelijk (Woordenlijst).",
          "Kies Belgische formuleringen waar die natuurlijk zijn (bijv. bankkaart i.p.v. pinpas, gsm waar dat past).",
          "Vermijd typisch Nederlandse (NL) spreektaal of Holland-centrische voorbeelden tenzij de klant dat vraagt.",
          "Aanspreekvorm (je/jij of u) volgt de tone of voice van de klant.",
        ].join(" ")
      : "Write in natural English.",
    "Doel: de tekst moet klinken alsof een ervaren menselijke copywriter hem schreef. Geen AI-achtige toon.",
    [
      "HOOFDLETTERS — harde regel voor title, <h1>, <h2> en <h3>:",
      "Gebruik zinsvorm (sentence case). Nooit Title Case. Nooit elk woord met een hoofdletter.",
      "Alleen de eerste letter van de titel/kop mag een hoofdletter zijn, plus eigennamen en vaste afkortingen (AI, CEO, VICE, België).",
      "Fout (verboden): 'Waarom Strakke Latex Pakjes In Films Een Blikvanger Zijn'",
      "Goed: 'Waarom strakke latex pakjes in films een blikvanger zijn'",
      "Fout: 'Meer Richting In Je Marketing' — Goed: 'Meer richting in je marketing'",
      "Dit geldt absoluut ook voor het JSON-veld title en de <h1>. Geen ALL CAPS.",
    ].join(" "),
    "Schrijf in volzinnen. Wissel zinslengte af. Vermijd opsommingen van abstracte buzzwoorden zonder uitleg.",
    "Vermijd typische AI-constructies, onder meer:",
    "- 'geen X, maar Y' / 'niet X, maar Y' / 'niet alleen X, ook Y' als vaste truc",
    "- 'In een wereld waarin…', 'Laten we eens kijken…', 'Het is geen geheim dat…'",
    "- 'Hier is waarom…', 'Kort samengevat:', 'Belangrijk om te onthouden:'",
    "- overdreven antithesen, rijtjes van drie, en sloganeske parallelle zinnen",
    "- overbodige metaforen, opgeblazen beloftes en generieke motivational language",
    "Gebruik uitsluitend de tone of voice van de klant.",
    "Tone of voice bepaalt hoe de tekst klinkt, niet welke feiten waar zijn.",
    "Verzin geen statistieken, onderzoeken, cases, testimonials, certificeringen, prijzen of resultaten.",
    "Als feiten ontbreken: formuleer zonder de claim of stel geen interne opmerkingen in de artikeltekst.",
    "Structuur van bodyHtml is verplicht:",
    "- Exact één <h1> met de artikeltitel (zelfde tekst als JSON-veld title).",
    "- Daarna een inleiding in <p>.",
    "- Logische secties met <h2>, en <h3> alleen waar een echte subsectie helpt.",
    "- Lopende tekst in <p>. Opsommingen met <ul>/<ol>/<li> alleen als dat de leesbaarheid écht verbetert.",
    "- Benadruk spaarzaam met <strong> en <em>. Links alleen met <a href>.",
    "Geen scripts, geen inline event handlers, geen externe scripts in HTML.",
    "Antwoord als JSON met keys: title (string), bodyHtml (string met alleen <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href>).",
    voice ? `Tone of voice van de klant:\n${voice}` : "",
  ].filter(Boolean).join("\n\n");
}

export async function generateBlogText(input: {
  mode: BlogMode;
  sourceText: string;
  language: string;
  lengthKey: BlogLength;
  voice: string;
  positioning?: string;
  instruction?: string;
  currentTitle?: string;
  currentBodyHtml?: string;
}): Promise<BlogAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. Vraag een beheerder om de configuratie.");

  const openai = new OpenAI({ apiKey });
  const model = resolveBlogTextModel();

  const userParts: string[] = [];
  if (input.instruction) {
    userParts.push(`Herschrijfopdracht: ${input.instruction}`);
    userParts.push(`Huidige titel: ${input.currentTitle || ""}`);
    userParts.push(`Huidige body HTML:\n${input.currentBodyHtml || ""}`);
  } else if (input.mode === "rewrite") {
    userParts.push("Modus: herschrijf bestaande tekst.");
    userParts.push("Behoud betekenis, feiten, namen, getallen en essentiële nuance.");
    userParts.push("Voeg geen nieuwe bedrijfsclaims toe.");
    userParts.push(`Brontekst:\n${input.sourceText}`);
  } else {
    userParts.push("Modus: nieuw artikel.");
    userParts.push("Genereer een volledig artikel met <h1>, inleiding, <h2>/<h3>-secties, bodyparagrafen en passend slot.");
    userParts.push(
      "Titel (<h1>) en tussenkoppen in zinsvorm: NOOIT Title Case. Voorbeeld title: 'Waarom strakke latex pakjes in films een blikvanger zijn'.",
    );
    userParts.push("Alleen een CTA wanneer die past en onderbouwd is vanuit de invoer.");
    userParts.push(`Onderwerp:\n${input.sourceText}`);
  }
  userParts.push("Zet altijd H1, H2 (en H3 waar nuttig) en paragraaftekst in bodyHtml — geen platte tekst zonder koppen.");
  userParts.push(
    "Controleer title en <h1> vóór je antwoordt: als meer dan het eerste woord een hoofdletter heeft (zonder eigennamen), herschrijf naar zinsvorm.",
  );
  userParts.push(`Lengte: ${LENGTH_HINT[input.lengthKey]}`);
  if (input.positioning) userParts.push(`Positionering (geen bewijs, alleen context):\n${input.positioning}`);

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemRules(input.voice, input.language) },
      { role: "user", content: userParts.join("\n\n") },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen blogtekst van het model ontvangen.");
  const json = JSON.parse(raw) as Record<string, unknown>;
  const parsed = blogResultSchema.safeParse({
    title: json.title ?? json.titel,
    bodyHtml: sanitizeBlogHtml(String(json.bodyHtml ?? json.body_html ?? json.body ?? "")),
  });
  if (!parsed.success) throw new Error("De AI-output was ongeldig. Probeer opnieuw.");
  return normalizeBlogDocument(parsed.data.title, parsed.data.bodyHtml);
}

export async function generateBlogImage(input: {
  title: string;
  summary: string;
  stylePrompt: string;
  tags: string[];
  doText: string;
  avoidText: string;
  colors: { name: string; hex: string; role: string }[];
  brandName: string;
  tweak?: string;
}): Promise<{ bytes: Uint8Array; mime: string; prompt: string; styleSummary: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. Vraag een beheerder om de configuratie.");

  const openai = new OpenAI({ apiKey });
  const model = resolveBlogImageModel();

  const colorLine = input.colors
    .slice(0, 4)
    .map((color) => `${color.name || color.role} ${color.hex}`)
    .join(", ");

  const styleSummary = [
    input.stylePrompt,
    input.tags.length ? `Tags: ${input.tags.join(", ")}` : "",
    input.doText ? `Wel: ${input.doText}` : "",
  ].filter(Boolean).join(" · ").slice(0, 220) || `Beeldstijl van ${input.brandName}`;

  const prompt = [
    `Editorial blog visual for ${input.brandName}, wide 16:9 composition.`,
    `Subject: ${input.title || input.summary}`,
    input.summary ? `Article context: ${input.summary.slice(0, 400)}` : "",
    input.stylePrompt ? `Brand visual style: ${input.stylePrompt}` : "",
    input.tags.length ? `Mood tags: ${input.tags.join(", ")}` : "",
    input.doText ? `Do: ${input.doText}` : "",
    input.avoidText ? `Avoid: ${input.avoidText}` : "",
    colorLine ? `Brand colors as atmosphere only (not exact print match): ${colorLine}` : "",
    input.tweak ? `User change request: ${input.tweak}` : "",
    "Photorealistic, no logos, no readable text, no watermarks, no UI mockups.",
  ].filter(Boolean).join("\n");

  const result = await openai.images.generate({
    model,
    prompt,
    size: "1536x1024",
    quality: "high",
  });

  const item = result.data?.[0];
  if (!item) throw new Error("Geen beeld van de provider ontvangen.");

  if (item.b64_json) {
    const binary = Buffer.from(item.b64_json, "base64");
    return { bytes: new Uint8Array(binary), mime: "image/png", prompt, styleSummary };
  }
  if (item.url) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error("Het gegenereerde beeld kon niet worden gedownload.");
    const buffer = new Uint8Array(await response.arrayBuffer());
    const mime = response.headers.get("content-type") || "image/png";
    return { bytes: buffer, mime, prompt, styleSummary };
  }
  throw new Error("De beeldprovider gaf geen bruikbaar resultaat.");
}

export const BLOG_MORE_BREAK_HTML =
  '<div class="blog-more-break" data-blog-more="true" contenteditable="false"><span>Meer lezen — korte versie stopt hier</span><button type="button" class="blog-more-break-remove" data-remove-more="true" contenteditable="false" aria-label="Meer-lezen verwijderen" title="Verwijderen">×</button></div>';

export function sanitizeBlogHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\/?(?:html|body|head|iframe|object|embed|form|input|button)[^>]*>/gi, "");
}

/** Zet de editor-markering om naar WordPress/Blogger <!--more--> voor export/kopiëren. */
export function toBlogExportHtml(html: string): string {
  return sanitizeBlogHtml(html)
    .replace(/<div[^>]*data-blog-more(?:="[^"]*")?[^>]*>[\s\S]*?<\/div>/gi, "<!--more-->")
    .replace(/<hr[^>]*data-blog-more(?:="[^"]*")?[^>]*\/?>/gi, "<!--more-->");
}

export function buildInlineVisualHtml(input: {
  visualId: string;
  url: string;
  altText: string;
}): string {
  const alt = escapeHtmlText(input.altText || "Blogvisual");
  const id = escapeHtmlText(input.visualId);
  const src = escapeHtmlText(input.url);
  return `<figure class="blog-inline-visual" data-visual-id="${id}" contenteditable="false"><button type="button" class="blog-inline-visual-remove" data-remove-visual="true" contenteditable="false" aria-label="Afbeelding verwijderen" title="Verwijderen">×</button><img data-visual-id="${id}" src="${src}" alt="${alt}" /></figure>`;
}

export function hydrateInlineVisualUrls(
  html: string,
  visuals: { id: string; url: string | null; altText: string }[],
): string {
  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  return html.replace(
    /<figure([^>]*data-visual-id=["']([^"']+)["'][^>]*)>[\s\S]*?<\/figure>/gi,
    (_full, _attrs: string, id: string) => {
      const visual = byId.get(id);
      if (!visual?.url) {
        return `<figure class="blog-inline-visual" data-visual-id="${escapeHtmlText(id)}" contenteditable="false"><span class="blog-inline-visual-missing">Beeld niet beschikbaar</span></figure>`;
      }
      return buildInlineVisualHtml({
        visualId: id,
        url: visual.url,
        altText: visual.altText,
      }).replace(/<p><\/p>$/, "");
    },
  );
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractBlogTitle(html: string): string {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? htmlToPlain(match[1]) : "";
}

export function stripBlogH1(html: string): string {
  return html.replace(/<h1[\s\S]*?<\/h1>/gi, "").trim();
}

const HEADING_ACRONYMS = new Set([
  "ai",
  "ceo",
  "cmo",
  "crm",
  "seo",
  "b2b",
  "b2c",
  "kmo",
  "btw",
  "eu",
  "vs",
  "uk",
  "vice",
  "hr",
  "pr",
  "api",
  "saas",
]);

/** Zet Title Case / overmatige hoofdletters om naar zinsvorm (eerste letter + acronyms/eigennamen-heuristiek). */
export function toSentenceCaseHeading(text: string, locale = "nl-BE"): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  const words = trimmed.split(" ");
  const letterWords = words.filter((word) => /[A-Za-zÀ-ÿ]/.test(word));
  const titleCased = letterWords.filter((word) => {
    const core = word.replace(/^[^A-Za-zÀ-ÿ]+/, "").replace(/[^A-Za-zÀ-ÿ]+$/, "");
    return core.length > 1 && /^[A-ZÀ-Ü][a-zà-ü'’-]+$/.test(core);
  });
  const looksLikeTitleCase =
    letterWords.length >= 3 && titleCased.length / letterWords.length >= 0.5;

  if (!looksLikeTitleCase && !/^[A-ZÀ-Ü\s'’-]+$/.test(trimmed)) {
    // Al zinsvorm of korte kop: laat staan, behalve ALL CAPS
    if (!/^[A-ZÀ-Ü0-9\s'’.,:;!?-]+$/.test(trimmed) || letterWords.length < 2) {
      return trimmed;
    }
  }

  return words
    .map((word, index) => {
      const match = word.match(/^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*)([^A-Za-zÀ-ÿ]*)$/);
      if (!match) return word;
      const [, prefix, core, suffix] = match;
      const lower = core.toLocaleLowerCase(locale);
      if (HEADING_ACRONYMS.has(lower)) {
        return `${prefix}${lower.toLocaleUpperCase("en-US")}${suffix}`;
      }
      if (index === 0) {
        return `${prefix}${lower.charAt(0).toLocaleUpperCase(locale)}${lower.slice(1)}${suffix}`;
      }
      // Behoud bestaande eigennamen die niet Title-Case-achtig in de hele string zaten;
      // bij Title Case forceren we lowercase.
      return `${prefix}${lower}${suffix}`;
    })
    .join(" ");
}

function applySentenceCaseToHeadings(html: string): string {
  return html.replace(/<(h[1-3])(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_full, tag: string, attrs: string | undefined, inner: string) => {
    const plain = htmlToPlain(inner);
    const fixed = toSentenceCaseHeading(plain);
    return `<${tag.toLowerCase()}${attrs ?? ""}>${escapeHtmlText(fixed)}</${tag.toLowerCase()}>`;
  });
}

/** Zorgt dat het blogbericht precies één H1 heeft, gevolgd door body met H2/H3/p. */
export function normalizeBlogDocument(title: string, bodyHtml: string): BlogAiResult {
  const sanitized = applySentenceCaseToHeadings(sanitizeBlogHtml(bodyHtml));
  const fromH1 = extractBlogTitle(sanitized);
  const resolvedTitle = toSentenceCaseHeading((title.trim() || fromH1 || "Naamloos artikel").trim());
  const rest = applySentenceCaseToHeadings(stripBlogH1(sanitized) || "<p></p>");
  return {
    title: resolvedTitle,
    bodyHtml: sanitizeBlogHtml(`<h1>${escapeHtmlText(resolvedTitle)}</h1>${rest}`),
  };
}

export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}
