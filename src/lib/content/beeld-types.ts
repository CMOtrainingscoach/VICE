import type { ImageAspectRatio } from "@/lib/ai/image-provider";
import type { TypeRole } from "@/lib/brand/types";

export type BeeldImageQuality = "1K" | "2K" | "4K";

export type BeeldCanvasPreset = {
  id: string;
  label: string;
  platform: string;
  aspectRatio: ImageAspectRatio;
  /** Export width in pixels at 1× (scaled by quality multiplier). */
  width: number;
  height: number;
};

/** Common platform sizes — aspect maps to Gemini Nano; export uses width×height × quality scale. */
export const BEELD_CANVAS_PRESETS: BeeldCanvasPreset[] = [
  {
    id: "instagram_feed",
    label: "Instagram feed",
    platform: "Instagram",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
  },
  {
    id: "instagram_story",
    label: "Instagram story / Reels",
    platform: "Instagram",
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
  },
  {
    id: "facebook_feed",
    label: "Facebook / LinkedIn feed",
    platform: "Meta / LinkedIn",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
  },
  {
    id: "linkedin_banner",
    label: "LinkedIn banner",
    platform: "LinkedIn",
    aspectRatio: "16:9",
    width: 1584,
    height: 396,
  },
  {
    id: "facebook_link",
    label: "Link preview (breed)",
    platform: "Facebook / X",
    aspectRatio: "16:9",
    width: 1200,
    height: 630,
  },
  {
    id: "pinterest_pin",
    label: "Pinterest pin",
    platform: "Pinterest",
    aspectRatio: "4:5",
    width: 1000,
    height: 1250,
  },
  {
    id: "youtube_thumb",
    label: "YouTube thumbnail",
    platform: "YouTube",
    aspectRatio: "16:9",
    width: 1280,
    height: 720,
  },
  {
    id: "x_post",
    label: "X / Twitter post",
    platform: "X",
    aspectRatio: "16:9",
    width: 1200,
    height: 675,
  },
];

export const BEELD_QUALITY_OPTIONS: { id: BeeldImageQuality; label: string; scale: number }[] = [
  { id: "1K", label: "1K — snel", scale: 1 },
  { id: "2K", label: "2K — scherp", scale: 2 },
  { id: "4K", label: "4K — print / groot", scale: 4 },
];

export function beeldPresetById(id: string): BeeldCanvasPreset {
  return BEELD_CANVAS_PRESETS.find((p) => p.id === id) ?? BEELD_CANVAS_PRESETS[0];
}

export function beeldExportDimensions(presetId: string, quality: BeeldImageQuality): { width: number; height: number } {
  const preset = beeldPresetById(presetId);
  const scale = BEELD_QUALITY_OPTIONS.find((q) => q.id === quality)?.scale ?? 1;
  return {
    width: Math.round(preset.width * scale),
    height: Math.round(preset.height * scale),
  };
}

export type BeeldLayerKind = "image" | "logo" | "text";

export type BeeldLayerBase = {
  id: string;
  name: string;
  kind: BeeldLayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type BeeldImageLayer = BeeldLayerBase & {
  kind: "image";
  source: "ai" | "upload";
  storagePath: string;
  mimeType: string;
  url?: string | null;
  prompt: string;
  /** Full canvas cover vs positioned box (logo/text). */
  fit: "cover" | "contain";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BeeldLogoLayer = BeeldLayerBase & {
  kind: "logo";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BeeldTextLayer = BeeldLayerBase & {
  kind: "text";
  text: string;
  typeRole: TypeRole;
  color: string;
  align: "left" | "center" | "right";
  x: number;
  y: number;
  width: number;
  fontSizePx: number;
};

export type BeeldLayer = BeeldImageLayer | BeeldLogoLayer | BeeldTextLayer;

export type BeeldDocument = {
  layers: BeeldLayer[];
};

export type BeeldCompositionSummary = {
  id: string;
  title: string;
  presetId: string;
  updatedAt: string;
};

export type BeeldComposition = {
  id: string;
  tenantId: string;
  title: string;
  presetId: string;
  imageQuality: BeeldImageQuality;
  brandCharacterId: string | null;
  styleId: string;
  document: BeeldDocument;
  updatedAt: string;
  createdAt: string;
};

export const BEELD_MIGRATION =
  "Pas migratie 20260330136408 toe in de Supabase SQL-editor (beeld-composities + lagen).";

export function newBeeldLayerId(): string {
  return crypto.randomUUID();
}

export function defaultLayerName(kind: BeeldLayerKind, index: number): string {
  if (kind === "text") return `Tekst ${index}`;
  if (kind === "logo") return "Logo";
  return `Beeld ${index}`;
}
