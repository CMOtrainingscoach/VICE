import OpenAI from "openai";
import { emptyVisualStyle, type BrandVisualStyle } from "@/lib/brand/types";
import { modelSupportsCustomTemperature, resolveBrandVisionModel } from "@/lib/openai/models";

type CoercedStyle = {
  name: string;
  tags: string[];
  do: string;
  avoid: string;
  stylePrompt: string;
  imageIndexes: number[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return value.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
    }
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
}

function asIndexArray(value: unknown, imageCount: number): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "number" ? item : Number.parseInt(String(item), 10)))
    .filter((item) => Number.isFinite(item) && item >= 0 && item < imageCount)
    .map((item) => Math.trunc(item));
}

function pickStylePrompt(row: Record<string, unknown>): string {
  return (
    asString(row.stylePrompt) ||
    asString(row.style_prompt) ||
    asString(row.prompt) ||
    asString(row.visualPrompt) ||
    asString(row.merkstijl) ||
    asString(row.description)
  );
}

function coerceStyles(raw: unknown, imageCount: number): CoercedStyle[] {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let list: unknown =
    root.styles ??
    root.Styles ??
    root.beeldstijlen ??
    root.stijlen ??
    root.results ??
    root.data;

  if (!Array.isArray(list)) {
    if (pickStylePrompt(root) || rowName(root)) {
      list = [root];
    } else {
      list = [];
    }
  }

  return (list as unknown[])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((row, index) => {
      const tags = asStringArray(row.tags ?? row.Keywords ?? row.keywords);
      const doText = asString(row.do ?? row.wel ?? row.include);
      const avoid = asString(row.avoid ?? row.vermijd ?? row.exclude);
      let stylePrompt = pickStylePrompt(row);
      if (stylePrompt.length < 40) {
        stylePrompt = [
          stylePrompt,
          doText ? `Do: ${doText}` : "",
          avoid ? `Avoid: ${avoid}` : "",
          tags.length ? `Mood: ${tags.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
          .trim();
      }
      return {
        name: asString(row.name ?? row.title ?? row.naam ?? row.label) || `Beeldstijl ${index + 1}`,
        tags: tags.slice(0, 12),
        do: doText,
        avoid,
        stylePrompt,
        imageIndexes: asIndexArray(row.imageIndexes ?? row.image_indexes ?? row.images ?? row.indexes, imageCount),
      };
    })
    .filter((style) => style.stylePrompt.length >= 20);
}

function rowName(row: Record<string, unknown>): string {
  return asString(row.name ?? row.title ?? row.naam);
}

function parseJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("JSON parse failed");
  }
}

export async function extractVisualStylesFromImages(input: {
  brandName: string;
  images: { bytes: Uint8Array; mime: string; name: string }[];
}): Promise<{ styles: BrandVisualStyle[]; assignment: number[][] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. Vraag een beheerder om de configuratie.");
  if (input.images.length === 0) throw new Error("Upload eerst referentiebeelden.");

  const openai = new OpenAI({ apiKey });
  const model = resolveBrandVisionModel();

  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: [
        `Extract the PHOTOGRAPHIC / VISUAL STYLE from these reference images for brand "${input.brandName || "the client"}".`,
        "CRITICAL: Ignore what is depicted (car, building, person, product, location). Do NOT describe subjects, objects, or scenes as the style.",
        "ONLY extract how the image looks: medium (photo/film/illustration), realism level, color palette & grading, contrast, saturation, lighting quality/direction/time-of-day feel, shadows/highlights, sharpness/detail/grain/noise, depth of field, lens/camera character, composition mood, texture treatment, overall aesthetic tone.",
        "If images share one look: return exactly 1 style. If clearly different looks: up to 4 separate styles.",
        "name: short style label (e.g. 'Cool cinematic realism'), never a subject label (not 'Sports car' or 'Factory').",
        "tags: style keywords only (e.g. photorealistic, teal-orange grade, soft key light) — no object names.",
        "do / avoid: photographic/style instructions only, not subjects to include/exclude unless a visual treatment is forbidden (e.g. neon cyberpunk).",
        "stylePrompt: English reusable LOOK block (8–16 sentences) that can wrap ANY future subject. Explicitly say the look must apply regardless of subject. No cars, buildings, people, or products named unless as texture/material references (steel, wet asphalt, wool).",
        "imageIndexes: 0-based indexes of images belonging to that style.",
        'Return ONLY JSON: { "styles": [{ "name", "tags", "do", "avoid", "stylePrompt", "imageIndexes" }] }.',
      ].join("\n"),
    },
  ];

  input.images.forEach((image, index) => {
    parts.push({ type: "text", text: `Image index ${index}: ${image.name}` });
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`,
        detail: "high",
      },
    });
  });

  let raw = "";
  try {
    const completion = await openai.chat.completions.create({
      model,
      ...(modelSupportsCustomTemperature(model) ? { temperature: 0.2 } : {}),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a photography art director specializing in visual style transfer briefs.",
            "Your job is to describe HOW images look, never WHAT they show.",
            "Forbidden in outputs: listing the main subject (car, factory, person, skyline) as the style definition.",
            "Required: lighting, color grade, contrast, realism, grain/detail, lens character, mood of the look.",
            "Output valid JSON only.",
          ].join(" "),
        },
        { role: "user", content: parts },
      ],
    });
    raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const refusal = (completion.choices[0]?.message as { refusal?: string } | undefined)?.refusal;
    if (refusal) throw new Error(`Model weigerde de analyse: ${refusal}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stijlanalyse mislukt";
    if (/vision|image|unsupported|modalit/i.test(message)) {
      throw new Error(
        `Dit vision-model (${model}) kon de foto niet verwerken. Zet VICE_BRAND_VISION_MODEL op gpt-4o of een vision-capable model.`,
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }

  if (!raw) throw new Error("Geen stijlanalyse van het model ontvangen. Probeer opnieuw.");

  let json: unknown;
  try {
    json = parseJsonLenient(raw);
  } catch {
    throw new Error("Het AI-antwoord was geen geldige JSON. Probeer opnieuw.");
  }

  const coerced = coerceStyles(json, input.images.length);
  if (coerced.length === 0) {
    throw new Error(
      "De stijlanalyse leverde geen bruikbare stijl-prompt op. Probeer opnieuw, of vul de basisstijl handmatig in.",
    );
  }

  const styles = coerced.map((style) =>
    emptyVisualStyle({
      name: style.name,
      active: true,
      tags: style.tags,
      do: style.do,
      avoid: style.avoid,
      stylePrompt: style.stylePrompt,
      references: [],
    }),
  );

  return {
    styles,
    assignment: coerced.map((style) =>
      style.imageIndexes.length > 0 ? style.imageIndexes : input.images.map((_, index) => index),
    ),
  };
}
