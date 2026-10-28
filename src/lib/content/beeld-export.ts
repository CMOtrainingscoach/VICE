import { drawEuAiLabelOnCanvas } from "@/lib/content/beeld-ai-label";
import type { BeeldCanvasPreset, BeeldDocument, BeeldLayer } from "@/lib/content/beeld-types";
import type { TypeStyle } from "@/lib/brand/types";
import { fontStack } from "@/lib/brand/fonts";

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Afbeelding laden mislukt"));
    img.src = url;
  });
  return img;
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: Extract<BeeldLayer, { kind: "image" }>,
  canvasW: number,
  canvasH: number,
  img: HTMLImageElement,
) {
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  const boxW = (layer.width / 100) * canvasW;
  const boxH = (layer.height / 100) * canvasH;
  const x = (layer.x / 100) * canvasW;
  const y = (layer.y / 100) * canvasH;

  if (layer.fit === "cover" && layer.width >= 99 && layer.height >= 99) {
    const scale = Math.max(canvasW / img.width, canvasH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (canvasW - w) / 2, (canvasH - h) / 2, w, h);
  } else {
    const scale =
      layer.fit === "contain"
        ? Math.min(boxW / img.width, boxH / img.height)
        : Math.max(boxW / img.width, boxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
  }
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: Extract<BeeldLayer, { kind: "text" }>,
  canvasW: number,
  canvasH: number,
  typography: Partial<Record<string, TypeStyle>>,
) {
  const style = typography[layer.typeRole];
  const family = style?.family || "Inter";
  const weight = style?.weight || "600";
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.fillStyle = layer.color;
  ctx.font = `${weight} ${layer.fontSizePx}px ${fontStack(family)}`;
  ctx.textAlign = layer.align;
  const boxW = (layer.width / 100) * canvasW;
  const x =
    layer.align === "center"
      ? (layer.x / 100) * canvasW + boxW / 2
      : layer.align === "right"
        ? (layer.x / 100) * canvasW + boxW
        : (layer.x / 100) * canvasW;
  let y = (layer.y / 100) * canvasH;
  const lines = wrapText(ctx, layer.text, boxW);
  const lineHeight = layer.fontSizePx * 1.2;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  ctx.restore();
}

export async function flattenBeeldDocument(input: {
  document: BeeldDocument;
  preset: BeeldCanvasPreset;
  exportWidth: number;
  exportHeight: number;
  logoUrl?: string | null;
  typography: Partial<Record<string, TypeStyle>>;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = input.exportWidth;
  canvas.height = input.exportHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar");

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const layer of input.document.layers) {
    if (!layer.visible) continue;
    if (layer.kind === "image" && layer.url) {
      const img = await loadImage(layer.url);
      drawImageLayer(ctx, layer, canvas.width, canvas.height, img);
    }
    if (layer.kind === "logo" && input.logoUrl) {
      const img = await loadImage(input.logoUrl);
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      const boxW = (layer.width / 100) * canvas.width;
      const boxH = (layer.height / 100) * canvas.height;
      const x = (layer.x / 100) * canvas.width;
      const y = (layer.y / 100) * canvas.height;
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
      ctx.restore();
    }
    if (layer.kind === "ai_label") {
      drawEuAiLabelOnCanvas(ctx, layer, canvas.width, canvas.height);
    }
    if (layer.kind === "text" && layer.text.trim()) {
      drawTextLayer(ctx, layer, canvas.width, canvas.height, input.typography);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export mislukt"))),
      "image/jpeg",
      0.92,
    );
  });
}
