import OpenAI from "openai";
import { z } from "zod";
import {
  modelSupportsCustomTemperature,
  resolveBlogTextModel,
} from "@/lib/openai/models";
import {
  META_LIMITS,
  RSA_LIMITS,
  type AdFormat,
  type AdPlatform,
  type GoogleRsaPayload,
  type MetaCarouselPayload,
  type MetaSinglePayload,
} from "@/lib/content/ad-types";

const rsaSchema = z.object({
  finalUrl: z.string().optional().default(""),
  headlines: z.array(z.string()).min(3).max(RSA_LIMITS.headlineMaxCount),
  descriptions: z.array(z.string()).min(2).max(RSA_LIMITS.descriptionMaxCount),
  path1: z.string().optional().default(""),
  path2: z.string().optional().default(""),
});

const metaSingleSchema = z.object({
  primaryText: z.string().min(1),
  headline: z.string().min(1),
  description: z.string().optional().default(""),
  linkUrl: z.string().optional().default(""),
  cta: z.string().optional().default(""),
});

const metaCarouselSchema = z.object({
  primaryText: z.string().min(1),
  linkUrl: z.string().optional().default(""),
  cards: z
    .array(
      z.object({
        headline: z.string().min(1),
        description: z.string().optional().default(""),
        linkUrl: z.string().optional().default(""),
      }),
    )
    .min(2)
    .max(6),
});

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function normalizeRsa(raw: z.infer<typeof rsaSchema>): GoogleRsaPayload {
  return {
    finalUrl: raw.finalUrl?.trim() ?? "",
    headlines: raw.headlines.map((line) => clip(line, RSA_LIMITS.headlineMax)).filter(Boolean),
    descriptions: raw.descriptions.map((line) => clip(line, RSA_LIMITS.descriptionMax)).filter(Boolean),
    path1: clip(raw.path1 ?? "", RSA_LIMITS.pathMax),
    path2: clip(raw.path2 ?? "", RSA_LIMITS.pathMax),
  };
}

function normalizeMetaSingle(raw: z.infer<typeof metaSingleSchema>): MetaSinglePayload {
  return {
    primaryText: clip(raw.primaryText, META_LIMITS.primaryTextMax),
    headline: clip(raw.headline, META_LIMITS.headlineMax),
    description: clip(raw.description ?? "", META_LIMITS.descriptionMax),
    linkUrl: raw.linkUrl?.trim() ?? "",
    cta: clip(raw.cta ?? "", 40),
  };
}

function normalizeMetaCarousel(raw: z.infer<typeof metaCarouselSchema>): MetaCarouselPayload {
  return {
    primaryText: clip(raw.primaryText, META_LIMITS.primaryTextMax),
    linkUrl: raw.linkUrl?.trim() ?? "",
    cards: raw.cards.map((card) => ({
      id: crypto.randomUUID(),
      headline: clip(card.headline, META_LIMITS.headlineMax),
      description: clip(card.description ?? "", META_LIMITS.cardDescriptionMax),
      linkUrl: card.linkUrl?.trim() ?? "",
    })),
  };
}

export async function generateAdCopy(input: {
  platform: AdPlatform;
  format: AdFormat;
  language: string;
  topic: string;
  voice: string;
  audienceContext?: string;
  contentLearnings?: string;
  existingFinalUrl?: string;
}): Promise<GoogleRsaPayload | MetaSinglePayload | MetaCarouselPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const openai = new OpenAI({ apiKey });
  const model = resolveBlogTextModel();
  const isDutch = input.language !== "en";

  const limitsBlock =
    input.platform === "google_search"
      ? [
          `Koppen: max ${RSA_LIMITS.headlineMax} tekens, ${RSA_LIMITS.headlineMaxCount} stuks.`,
          `Beschrijvingen: max ${RSA_LIMITS.descriptionMax} tekens, ${RSA_LIMITS.descriptionMaxCount} stuks.`,
          `Pad 1/2: max ${RSA_LIMITS.pathMax} tekens.`,
        ].join("\n")
      : input.format === "single_image"
        ? [
            `Primaire tekst max ${META_LIMITS.primaryTextMax} tekens.`,
            `Kop max ${META_LIMITS.headlineMax}, beschrijving max ${META_LIMITS.descriptionMax}.`,
          ].join("\n")
        : [
            `Primaire tekst max ${META_LIMITS.primaryTextMax} tekens.`,
            `Per kaart: kop max ${META_LIMITS.headlineMax}, beschrijving max ${META_LIMITS.cardDescriptionMax}.`,
            "2–5 kaarten met opeenvolgend verhaal.",
          ].join("\n");

  const jsonShape =
    input.platform === "google_search"
      ? '{ "finalUrl": "", "headlines": ["..."], "descriptions": ["..."], "path1": "", "path2": "" }'
      : input.format === "single_image"
        ? '{ "primaryText": "", "headline": "", "description": "", "linkUrl": "", "cta": "" }'
        : '{ "primaryText": "", "linkUrl": "", "cards": [{ "headline": "", "description": "", "linkUrl": "" }] }';

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.45 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je schrijft advertentieteksten voor VICE (voorbereiding, nog geen publish).",
          isDutch ? "Schrijf in Belgisch Nederlands." : "Write in natural English.",
          "Volg de tone of voice van de klant.",
          "Geen onbewezen claims, geen misleidende superlatieven.",
          limitsBlock,
          `Antwoord als JSON: ${jsonShape}`,
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          `Platform: ${input.platform}, formaat: ${input.format}`,
          `Onderwerp / briefing:\n${input.topic}`,
          input.existingFinalUrl ? `Bestaande URL (optioneel hergebruiken):\n${input.existingFinalUrl}` : "",
          input.audienceContext ? `Doelgroep:\n${input.audienceContext}` : "",
          input.contentLearnings ? `Leerpunten uit eerdere content:\n${input.contentLearnings}` : "",
          `Tone of voice:\n${input.voice.slice(0, 6000)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen advertentietekst van het model ontvangen.");

  const parsed = JSON.parse(raw) as unknown;
  if (input.platform === "google_search") {
    const result = rsaSchema.safeParse(parsed);
    if (!result.success) throw new Error("Ongeldige RSA-output van AI.");
    const normalized = normalizeRsa(result.data);
    if (normalized.headlines.length < 2 || normalized.descriptions.length < 1) {
      throw new Error("Te weinig koppen of beschrijvingen gegenereerd.");
    }
    return normalized;
  }
  if (input.format === "single_image") {
    const result = metaSingleSchema.safeParse(parsed);
    if (!result.success) throw new Error("Ongeldige Meta-single-output van AI.");
    return normalizeMetaSingle(result.data);
  }
  const result = metaCarouselSchema.safeParse(parsed);
  if (!result.success) throw new Error("Ongeldige Meta-carrousel-output van AI.");
  return normalizeMetaCarousel(result.data);
}
