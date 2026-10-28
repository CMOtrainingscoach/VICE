import type { BeeldLayer } from "@/lib/content/beeld-types";

export function beeldLayerIsFullBleedImage(layer: BeeldLayer): boolean {
  return layer.kind === "image" && layer.width >= 99 && layer.height >= 99;
}

/** Layers the user can drag on the canvas (not locked full-bleed backgrounds). */
export function beeldLayerIsCanvasDraggable(layer: BeeldLayer): boolean {
  if (layer.locked || !layer.visible) return false;
  if (layer.kind === "logo" || layer.kind === "text") return true;
  if (layer.kind === "image") return !beeldLayerIsFullBleedImage(layer);
  return false;
}

export function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function detachImageLayerFromCanvas(layer: Extract<BeeldLayer, { kind: "image" }>): BeeldLayer {
  return {
    ...layer,
    fit: "contain",
    x: 20,
    y: 20,
    width: 60,
    height: 45,
  };
}
