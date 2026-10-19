import OpenAI from "openai";
import { z } from "zod";
import { generateProviderImage, type ImageAspectRatio } from "@/lib/ai/image-provider";
import {
  modelSupportsCustomTemperature,
  resolveBlogTextModel,
} from "@/lib/openai/models";
import type { SocialChannel, SocialFormat } from "@/lib/content/social-types";

const captionSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.string().optional().default(""),
});

export type SocialCaptionResult = z.infer<typeof captionSchema>;

const CHANNEL_HINT: Record<SocialChannel, string> = {
  instagram: "Instagram: visueel, warm, korte alinea's, emoji spaarzaam",
  linkedin: "LinkedIn: professioneel, inhoudelijk, geen overdreven hype",
  facebook: "Facebook: toegankelijk, conversationeel",
  tiktok: "TikTok: kort, direct, hook in de eerste zin",
  x: "X: compact, scherp, bij voorkeur onder 280 tekens voor de kern",
};

const FORMAT_HINT: Record<SocialFormat, string> = {
  single: "Formaat: single image post.",
  carousel: "Formaat: carrousel — caption mag slides aankondigen zonder slide-per-slide opsomming.",
  reel: "Formaat: reel/vertical video — caption als hook + korte context; video zelf volgt later.",
};

export async function generateSocialCaption(input: {
  topic: string;
  channels: SocialChannel[];
  format: SocialFormat;
  language: string;
  voice: string;
  sourceContext?: string;
}): Promise<SocialCaptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const openai = new OpenAI({ apiKey });
  const model = resolveBlogTextModel();
  const isDutch = input.language !== "en";

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.5 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je schrijft socialmediacaptions voor VICE.",
          isDutch
            ? "Schrijf in Belgisch Nederlands. Geen AI-clichés."
            : "Write natural English. Avoid AI clichés.",
          "Gebruik de tone of voice van de klant.",
          "Verzin geen statistieken, cases of beloftes die niet in de bron staan.",
          "Antwoord als JSON: { caption: string, hashtags: string }.",
          "hashtags: spatiegescheiden, met #, max 8, optioneel.",
          input.voice ? `Tone of voice:\n${input.voice}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      {
        role: "user",
        content: [
          `Onderwerp:\n${input.topic}`,
          input.sourceContext ? `Broncontext:\n${input.sourceContext.slice(0, 6000)}` : "",
          `Kanalen: ${input.channels.map((c) => CHANNEL_HINT[c]).join(" · ")}`,
          FORMAT_HINT[input.format],
          "Schrijf één caption die werkt voor de gekozen kanalen (niet meerdere versies).",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen caption van het model ontvangen.");
  const parsed = captionSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Ongeldige caption-response van AI.");
  return {
    caption: parsed.data.caption.trim(),
    hashtags: (parsed.data.hashtags || "").trim(),
  };
}

export function socialImageAspect(format: SocialFormat): ImageAspectRatio {
  if (format === "reel") return "9:16";
  return "1:1";
}

export async function generateSocialImage(input: {
  topic: string;
  caption: string;
  format: SocialFormat;
  stylePrompt: string;
  tags: string[];
  doText: string;
  avoidText: string;
  colors: { name: string; hex: string; role: string }[];
  brandName: string;
  styleName?: string;
  subject?: string;
}): Promise<{ bytes: Uint8Array; mime: string; prompt: string; styleSummary: string; width: number; height: number }> {
  const aspect = socialImageAspect(input.format);
  const width = aspect === "9:16" ? 1024 : 1024;
  const height = aspect === "9:16" ? 1536 : 1024;

  const colorLine = input.colors
    .slice(0, 4)
    .map((color) => `${color.name || color.role} ${color.hex}`)
    .join(", ");

  const styleSummary = [
    input.styleName,
    input.stylePrompt,
    input.tags.length ? `Tags: ${input.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 220) || `Beeldstijl van ${input.brandName}`;

  const subject = input.subject?.trim() || input.topic;
  const prompt = [
    "LOCKED BRAND VISUAL STYLE — follow this block strictly; do not invent another aesthetic:",
    input.stylePrompt || `Brand look of ${input.brandName}`,
    "",
    `Social media visual for ${input.brandName}.`,
    input.format === "reel" ? "Vertical 9:16 composition for Reels/TikTok." : "Square 1:1 composition for a feed post.",
    input.styleName ? `Active style variant: ${input.styleName}` : "",
    `Photo subject: ${subject}`,
    input.caption ? `Caption context (content only): ${input.caption.slice(0, 280)}` : "",
    input.tags.length ? `Mood tags: ${input.tags.join(", ")}` : "",
    input.doText ? `Do: ${input.doText}` : "",
    input.avoidText ? `Avoid: ${input.avoidText}` : "",
    colorLine ? `Brand colors as atmosphere only: ${colorLine}` : "",
    "Photorealistic, no logos, no readable text, no watermarks, no UI mockups.",
  ]
    .filter(Boolean)
    .join("\n");

  const image = await generateProviderImage({ prompt, aspectRatio: aspect });
  return {
    bytes: image.bytes,
    mime: image.mime,
    prompt,
    styleSummary,
    width: image.width ?? width,
    height: image.height ?? height,
  };
}
