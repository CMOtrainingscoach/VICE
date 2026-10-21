import { generateProviderImage } from "@/lib/ai/image-provider";
import type { BrandContext } from "@/lib/content/blog-types";

export async function generatePersonaPortrait(input: {
  brand: BrandContext;
  displayName: string;
  roleTitle: string;
  summary: string;
  customPrompt?: string;
}): Promise<{ bytes: Uint8Array; mime: string; prompt: string; width: number; height: number }> {
  const style = input.brand.styles[0];
  const stylePrompt = style?.stylePrompt || input.brand.visual.stylePrompt;
  const colorLine = input.brand.colors
    .slice(0, 4)
    .map((c) => `${c.name || c.role} ${c.hex}`)
    .join(", ");

  const subject =
    input.customPrompt?.trim() ||
    [
      `Professional head-and-shoulders portrait illustration of a fictional ${input.roleTitle}.`,
      input.summary ? `Character context: ${input.summary.slice(0, 220)}` : "",
      "Friendly, credible business setting, not a celebrity, diverse and respectful.",
      "Illustration aligned with brand visual style — not photoreal stock.",
    ]
      .filter(Boolean)
      .join(" ");

  const prompt = [
    "LOCKED BRAND VISUAL STYLE:",
    stylePrompt || `Visual style of ${input.brand.brandName}`,
    "",
    subject,
    style?.do || input.brand.visual.do ? `Do: ${style?.do || input.brand.visual.do}` : "",
    style?.avoid || input.brand.visual.avoid ? `Avoid: ${style?.avoid || input.brand.visual.avoid}` : "",
    colorLine ? `Brand color atmosphere: ${colorLine}` : "",
    "Square portrait, no logos, no readable text, no watermarks.",
  ]
    .filter(Boolean)
    .join("\n");

  const image = await generateProviderImage({ prompt, aspectRatio: "1:1" });
  return {
    bytes: image.bytes,
    mime: image.mime,
    prompt,
    width: image.width ?? 1024,
    height: image.height ?? 1024,
  };
}
