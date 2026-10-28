/**
 * Unified image generation for blog + social visuals.
 * Providers: OpenAI (gpt-image-1) or Google Gemini Nano Banana.
 */

import {
  buildNanoCharacterIntro,
  mimeForNanoReference,
  type CharacterImageReference,
} from "@/lib/ai/character-image-input";

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "3:2";
export type ImageProviderId = "openai" | "gemini";

export type GeneratedImage = {
  bytes: Uint8Array;
  mime: string;
  provider: ImageProviderId;
  model: string;
  width?: number;
  height?: number;
};

export function resolveImageProvider(): ImageProviderId {
  const raw = (process.env.VICE_IMAGE_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "gemini" || raw === "google" || raw === "nano") return "gemini";
  if (raw === "openai") return "openai";
  // Auto: Gemini if key present, else OpenAI
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return "openai";
}

export function resolveGeminiImageModel(): string {
  return (
    process.env.VICE_GEMINI_IMAGE_MODEL?.trim()
    || process.env.VICE_IMAGE_MODEL?.trim()
    || "gemini-nano-banana-2.1"
  );
}

export function resolveOpenAiImageModel(): string {
  return process.env.VICE_BLOG_IMAGE_MODEL?.trim() || "gpt-image-1";
}

function openaiSizeForAspect(aspect: ImageAspectRatio): "1024x1024" | "1536x1024" | "1024x1536" {
  if (aspect === "16:9" || aspect === "3:2") return "1536x1024";
  if (aspect === "9:16" || aspect === "4:5") return "1024x1536";
  return "1024x1024";
}

function dimensionsForOpenaiSize(size: "1024x1024" | "1536x1024" | "1024x1536") {
  const [width, height] = size.split("x").map(Number) as [number, number];
  return { width, height };
}

async function generateWithOpenAi(prompt: string, aspect: ImageAspectRatio): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt voor beeldgeneratie.");

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey });
  const model = resolveOpenAiImageModel();
  const size = openaiSizeForAspect(aspect);
  const { width, height } = dimensionsForOpenaiSize(size);

  const result = await openai.images.generate({
    model,
    prompt,
    size,
    quality: "high",
  });

  const item = result.data?.[0];
  if (!item) throw new Error("Geen beeld van OpenAI ontvangen.");

  if (item.b64_json) {
    return {
      bytes: new Uint8Array(Buffer.from(item.b64_json, "base64")),
      mime: "image/png",
      provider: "openai",
      model,
      width,
      height,
    };
  }
  if (item.url) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error("OpenAI-beeld kon niet worden gedownload.");
    const buffer = new Uint8Array(await response.arrayBuffer());
    return {
      bytes: buffer,
      mime: response.headers.get("content-type") || "image/png",
      provider: "openai",
      model,
      width,
      height,
    };
  }
  throw new Error("OpenAI gaf geen bruikbaar beeldresultaat.");
}

type GeminiImageHit = { data: string; mime: string } | { uri: string; mime: string };

function extractGeminiImage(payload: unknown): GeminiImageHit | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const tryBlock = (block: unknown): GeminiImageHit | null => {
    if (!block || typeof block !== "object") return null;
    const row = block as Record<string, unknown>;
    const mime = String(row.mime_type ?? row.mimeType ?? "image/jpeg");
    const data = row.data ?? row.b64_json ?? row.bytes;
    if (typeof data === "string" && data) return { data, mime };
    const uri = row.uri ?? row.url;
    if (typeof uri === "string" && uri) return { uri, mime };
    return null;
  };

  const scanContentList = (list: unknown): GeminiImageHit | null => {
    if (!Array.isArray(list)) return null;
    for (const part of list) {
      if (!part || typeof part !== "object") continue;
      const row = part as Record<string, unknown>;
      const hit = tryBlock(row) || tryBlock(row.image) || tryBlock(row.content);
      if (hit) return hit;
      if (Array.isArray(row.content)) {
        const nested = scanContentList(row.content);
        if (nested) return nested;
      }
    }
    return null;
  };

  const direct = tryBlock(root.output_image) || tryBlock(root.outputImage);
  if (direct) return direct;

  // Current Interactions API: image lives in steps[].content[]
  const fromSteps = scanContentList(root.steps);
  if (fromSteps) return fromSteps;

  const fromOutputs = scanContentList(root.outputs ?? root.output);
  if (fromOutputs) return fromOutputs;

  // generateContent-style fallback
  const candidates = root.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = (candidate as { content?: { parts?: unknown[] } })?.content?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const partRow = part as {
          inlineData?: { data?: string; mimeType?: string };
          inline_data?: { data?: string; mime_type?: string };
        };
        const inline = partRow.inlineData ?? partRow.inline_data;
        if (inline?.data) {
          return {
            data: inline.data,
            mime:
              ("mimeType" in inline && inline.mimeType)
              || ("mime_type" in inline && inline.mime_type)
              || "image/jpeg",
          };
        }
      }
    }
  }

  return null;
}

function geminiFailureHint(payload: Record<string, unknown>): string {
  const status = typeof payload.status === "string" ? payload.status : null;
  if (status && status !== "completed") {
    return `Gemini-status: ${status}.`;
  }
  const steps = payload.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const content = (step as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const text = (part as { type?: string; text?: string })?.text;
        if (typeof text === "string" && text.trim()) {
          return text.trim().slice(0, 240);
        }
      }
    }
  }
  return "Controleer modeltoegang tot Nano Banana.";
}

async function generateWithGemini(
  prompt: string,
  aspect: ImageAspectRatio,
  characterReferences?: CharacterImageReference[],
): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt. Maak een API key in Google AI Studio / Cloud Console (Generative Language API).",
    );
  }

  const model = resolveGeminiImageModel();
  const imageSize = (process.env.VICE_GEMINI_IMAGE_SIZE?.trim().toUpperCase() || "1K") as "1K" | "2K" | "4K";

  const refs = characterReferences?.filter((ref) => ref.bytes?.length) ?? [];
  const input: { type: string; text?: string; mime_type?: string; data?: string }[] = [
    { type: "text", text: prompt },
  ];
  for (const ref of refs) {
    input.push({
      type: "image",
      mime_type: mimeForNanoReference(ref.mime),
      data: Buffer.from(ref.bytes).toString("base64"),
    });
  }

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      response_format: {
        type: "image",
        // Nano Banana accepteert hier alleen JPEG (niet PNG).
        mime_type: "image/jpeg",
        aspect_ratio: aspect,
        image_size: imageSize,
      },
    }),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (json.error as { message?: string } | undefined)?.message
      || (typeof json.message === "string" ? json.message : null)
      || `Gemini image API fout (${res.status})`;
    throw new Error(message);
  }

  const extracted = extractGeminiImage(json);
  if (!extracted) {
    throw new Error(`Gemini gaf geen afbeelding terug. ${geminiFailureHint(json)}`);
  }

  if ("uri" in extracted) {
    const imageRes = await fetch(extracted.uri);
    if (!imageRes.ok) {
      throw new Error("Gemini-beeld-URI kon niet worden gedownload.");
    }
    return {
      bytes: new Uint8Array(await imageRes.arrayBuffer()),
      mime: imageRes.headers.get("content-type") || extracted.mime || "image/jpeg",
      provider: "gemini",
      model,
    };
  }

  return {
    bytes: new Uint8Array(Buffer.from(extracted.data, "base64")),
    mime: extracted.mime || "image/jpeg",
    provider: "gemini",
    model,
  };
}

export async function generateProviderImage(input: {
  prompt: string;
  aspectRatio?: ImageAspectRatio;
  characterReferences?: CharacterImageReference[];
  characterName?: string;
}): Promise<GeneratedImage> {
  const aspect = input.aspectRatio ?? "16:9";
  const refs = input.characterReferences?.filter((ref) => ref.bytes?.length) ?? [];
  if (refs.length > 0) {
    if (resolveImageProvider() !== "gemini") {
      throw new Error(
        "Merpersonages in beelden vereisen Gemini Nano (VICE_IMAGE_PROVIDER=gemini en GEMINI_API_KEY).",
      );
    }
    const name = input.characterName?.trim() || "brand character";
    const prompt = `${buildNanoCharacterIntro(name, refs.length)}\n\n${input.prompt}`;
    return generateWithGemini(prompt, aspect, refs);
  }

  const provider = resolveImageProvider();
  if (provider === "gemini") {
    return generateWithGemini(input.prompt, aspect);
  }
  return generateWithOpenAi(input.prompt, aspect);
}
