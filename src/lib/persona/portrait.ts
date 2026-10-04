import OpenAI from "openai";

const STYLE = [
  "Realistic professional head-and-shoulders photograph of a fictional person.",
  "Neutral expression, soft even lighting, plain warm-gray background.",
  "Natural appearance. No text, logo, watermark, or exaggerated stock pose.",
  "Do not depict a recognizable real person.",
  "Do not infer age, gender, or ethnicity from any job, seniority, sector, or customer profile.",
  "The image is an illustration of a role, not a demographic claim.",
].join(" ");

export function portraitModel(): string {
  return process.env.VICE_PERSONA_IMAGE_MODEL?.trim() || "gpt-image-1";
}

export function portraitDailyLimit(): number {
  const parsed = Number(process.env.VICE_PERSONA_PORTRAIT_DAILY_LIMIT ?? 12);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 12;
}

/** Alleen de illustratie-instructie. Geen dossier, ICP of meetingnotes. */
export async function renderPortrait(visualPrompt: string): Promise<{ bytes: Buffer; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. De persona blijft bewaard.");
  const model = portraitModel();
  const openai = new OpenAI({ apiKey });
  const prompt = [
    STYLE,
    visualPrompt.trim()
      ? `Additional illustration direction, not a fact about the customer: ${visualPrompt.trim().slice(0, 300)}`
      : "Choose a fictional appearance yourself.",
  ].join(" ");
  const result = await openai.images.generate({ model, prompt, size: "1024x1024", n: 1 });
  const item = result.data?.[0];
  if (item?.b64_json) return { bytes: Buffer.from(item.b64_json, "base64"), model };
  if (item?.url) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error("Het portret kon niet worden opgehaald. Probeer opnieuw.");
    return { bytes: Buffer.from(await response.arrayBuffer()), model };
  }
  throw new Error("De beeldprovider gaf geen portret terug. De persona blijft bewaard.");
}
