/**
 * Unified image generation for blog + social visuals.
 * Providers: OpenAI (gpt-image-1) or Google Gemini Nano Banana.
 */

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

function extractGeminiImage(payload: unknown): { data: string; mime: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const tryBlock = (block: unknown): { data: string; mime: string } | null => {
    if (!block || typeof block !== "object") return null;
    const row = block as Record<string, unknown>;
    const data = row.data ?? row.b64_json ?? row.bytes;
    if (typeof data !== "string" || !data) return null;
    const mime = String(row.mime_type ?? row.mimeType ?? "image/png");
    return { data, mime };
  };

  const direct = tryBlock(root.output_image) || tryBlock(root.outputImage);
  if (direct) return direct;

  const outputs = root.outputs ?? root.output;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const nested =
        tryBlock(row)
        || tryBlock(row.image)
        || tryBlock(row.content);
      if (nested) return nested;
      if (Array.isArray(row.content)) {
        for (const part of row.content) {
          const fromPart = tryBlock(part) || tryBlock((part as { image?: unknown })?.image);
          if (fromPart) return fromPart;
        }
      }
    }
  }

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
              || "image/png",
          };
        }
      }
    }
  }

  return null;
}

async function generateWithGemini(prompt: string, aspect: ImageAspectRatio): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt. Maak een API key in Google AI Studio / Cloud Console (Generative Language API).",
    );
  }

  const model = resolveGeminiImageModel();
  const imageSize = (process.env.VICE_GEMINI_IMAGE_SIZE?.trim().toUpperCase() || "1K") as "1K" | "2K" | "4K";

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ type: "text", text: prompt }],
      response_format: {
        type: "image",
        mime_type: "image/png",
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
    throw new Error("Gemini gaf geen afbeelding terug. Controleer modeltoegang tot Nano Banana.");
  }

  return {
    bytes: new Uint8Array(Buffer.from(extracted.data, "base64")),
    mime: extracted.mime || "image/png",
    provider: "gemini",
    model,
  };
}

export async function generateProviderImage(input: {
  prompt: string;
  aspectRatio?: ImageAspectRatio;
}): Promise<GeneratedImage> {
  const aspect = input.aspectRatio ?? "16:9";
  const provider = resolveImageProvider();
  if (provider === "gemini") {
    return generateWithGemini(input.prompt, aspect);
  }
  return generateWithOpenAi(input.prompt, aspect);
}
