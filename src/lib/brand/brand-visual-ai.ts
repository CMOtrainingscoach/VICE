import OpenAI from "openai";
import { z } from "zod";
import { emptyVisualStyle, type BrandVisualStyle } from "@/lib/brand/types";
import { modelSupportsCustomTemperature, resolveBrandVisionModel } from "@/lib/openai/models";

const extractedSchema = z.object({
  styles: z
    .array(
      z.object({
        name: z.string().min(1),
        tags: z.array(z.string()).default([]),
        do: z.string().default(""),
        avoid: z.string().default(""),
        stylePrompt: z.string().min(20),
        imageIndexes: z.array(z.number().int().nonnegative()).default([]),
      }),
    )
    .min(1),
});

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
        `Analyseer deze referentiebeelden voor het merk "${input.brandName || "de klant"}".`,
        "Doel: haal uitvoerbare beeldstijl(en) voor latere AI-beeldgeneratie.",
        "Als de beelden één coherente stijl delen: geef exact 1 stijl.",
        "Als er duidelijk verschillende stijlen/clusters zijn: maak aparte stijlen (max 4).",
        "Elke stylePrompt moet een complete Engelse image-prompt-blok zijn (8-16 zinnen) dat camera, licht, sfeer, locatie, materialen, kleur en verboden elementen vastlegt.",
        "Gebruik imageIndexes (0-based) om te markeren welke uploads bij welke stijl horen.",
        "Antwoord als JSON: { styles: [{ name, tags, do, avoid, stylePrompt, imageIndexes }] }.",
        "Geen generieke stock-look. Geen Miami/tropisch/cyberpunk tenzij de beelden dat tonen.",
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

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.2 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Je bent een art director die merkbeeldstijlen uit referentiefoto's destilleert tot herbruikbare image-generation prompts.",
      },
      { role: "user", content: parts },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen stijlanalyse van het model ontvangen.");
  const parsed = extractedSchema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) throw new Error("De stijlanalyse was ongeldig. Probeer opnieuw met duidelijkere beelden.");

  const styles = parsed.data.styles.map((style) =>
    emptyVisualStyle({
      name: style.name.trim(),
      active: true,
      tags: style.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      do: style.do.trim(),
      avoid: style.avoid.trim(),
      stylePrompt: style.stylePrompt.trim(),
      references: [],
    }),
  );

  return {
    styles,
    assignment: parsed.data.styles.map((style) => style.imageIndexes),
  };
}
