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
    "Hoofdletters: alleen aan het begin van een zin en volgens de gewone spellingsregels (eigennamen, afkortingen zoals AI of CEO, enz.). Geen Title Case. Dit geldt voor de titel, tussenkoppen én body. Voorbeeld: 'Meer richting in je marketing' — niet 'Meer Richting In Je Marketing'. Geen ALL CAPS.",
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
    userParts.push("Titel en tussenkoppen in zinsvorm: alleen de eerste letter van de zin/kop hoofdletter, verder geen Title Case.");
    userParts.push("Alleen een CTA wanneer die past en onderbouwd is vanuit de invoer.");
    userParts.push(`Onderwerp:\n${input.sourceText}`);
  }
  userParts.push("Zet altijd H1, H2 (en H3 waar nuttig) en paragraaftekst in bodyHtml — geen platte tekst zonder koppen.");
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

export function sanitizeBlogHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\/?(?:html|body|head|iframe|object|embed|form|input|button)[^>]*>/gi, "");
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

/** Zorgt dat het blogbericht precies één H1 heeft, gevolgd door body met H2/H3/p. */
export function normalizeBlogDocument(title: string, bodyHtml: string): BlogAiResult {
  const sanitized = sanitizeBlogHtml(bodyHtml);
  const fromH1 = extractBlogTitle(sanitized);
  const resolvedTitle = (title.trim() || fromH1 || "Naamloos artikel").trim();
  const rest = stripBlogH1(sanitized) || "<p></p>";
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
