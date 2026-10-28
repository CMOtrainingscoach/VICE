import type { BeeldAiLabelLayer } from "@/lib/content/beeld-types";

export const EU_AI_LABEL_CIRCLE_FILL = "#989898";

/** Draw EU-style AI badge: circle only, transparent outside (no square matte). */
export function drawEuAiLabelOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: BeeldAiLabelLayer,
  canvasW: number,
  canvasH: number,
): void {
  const boxW = (layer.width / 100) * canvasW;
  const boxH = (layer.height / 100) * canvasH;
  const x = (layer.x / 100) * canvasW;
  const y = (layer.y / 100) * canvasH;
  const cx = x + boxW / 2;
  const cy = y + boxH / 2;
  const radius = Math.min(boxW, boxH) / 2;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = EU_AI_LABEL_CIRCLE_FILL;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  const fontSize = radius * 0.72;
  ctx.font = `700 ${fontSize}px system-ui, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AI", cx, cy + fontSize * 0.03);
  ctx.restore();
}
