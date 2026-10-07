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
  return [
    "Je schrijft blogs voor VICE, een strategisch platform.",
    `Schrijf in het ${language === "en" ? "Engels" : "Nederlands"}.`,
    "Gebruik uitsluitend de tone of voice van de klant.",
    "Tone of voice bepaalt hoe de tekst klinkt, niet welke feiten waar zijn.",
    "Verzin geen statistieken, onderzoeken, cases, testimonials, certificeringen, prijzen of resultaten.",
    "Als feiten ontbreken: formuleer zonder de claim of stel geen interne opmerkingen in de artikeltekst.",
    "Geen scripts, geen inline event handlers, geen externe scripts in HTML.",
    "Antwoord als JSON met keys: title (string), bodyHtml (string met alleen <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>).",
    "Gebruik geen <h1> in bodyHtml. De titel staat apart.",
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
    userParts.push("Genereer titel, inleiding, logische tussenkoppen, body en passend slot.");
    userParts.push("Alleen een CTA wanneer die past en onderbouwd is vanuit de invoer.");
    userParts.push(`Onderwerp:\n${input.sourceText}`);
  }
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
  return parsed.data;
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
