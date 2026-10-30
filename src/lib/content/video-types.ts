export type VideoIntendedUse = "social" | "ads" | "hero" | "general";
export type VideoAspectPreset =
  | "reel_9_16"
  | "feed_1_1"
  | "feed_4_5"
  | "hero_16_9"
  | "ads_9_16"
  | "ads_1_1";
export type VideoJobStatus = "idle" | "processing" | "ready" | "failed";
export type VideoDurationSeconds = 5 | 10;
export type VideoResolution = "720p" | "1080p";
export type VideoSourceKind = "upload" | "beeld";
export type VideoProvider = "openart" | "kling";

export type VideoConcept = {
  id: string;
  tenantId: string;
  internalName: string;
  intendedUse: VideoIntendedUse;
  aspectPreset: VideoAspectPreset;
  durationSeconds: VideoDurationSeconds;
  resolution: VideoResolution;
  motionPrompt: string;
  sourceKind: VideoSourceKind;
  sourceImagePath: string;
  sourceMimeType: string;
  beeldCompositionId: string | null;
  outputVideoPath: string;
  outputMimeType: string;
  jobStatus: VideoJobStatus;
  videoProvider: VideoProvider;
  klingTaskId: string;
  openartResourceId: string;
  jobError: string;
  unitsEstimated: number | null;
  unitsCharged: number | null;
  brandId: string | null;
  brandVersionNumber: number | null;
  brandVoiceSnapshot: string;
  brandVisualSnapshot: Record<string, unknown>;
  buyerPersonaId: string | null;
  brandCharacterId: string | null;
  createdAt: string;
  updatedAt: string;
  sourceImageUrl: string | null;
  outputVideoUrl: string | null;
};

export type VideoConceptSummary = {
  id: string;
  internalName: string;
  intendedUse: VideoIntendedUse;
  aspectPreset: VideoAspectPreset;
  durationSeconds: VideoDurationSeconds;
  jobStatus: VideoJobStatus;
  updatedAt: string;
};

export const VIDEO_MIGRATION =
  "Pas migraties 20260330136416_video_concepts.sql en 20260330136417_openart_video_billing.sql toe in Supabase.";

export const VIDEO_INTENDED_USES: { id: VideoIntendedUse; label: string }[] = [
  { id: "social", label: "Social" },
  { id: "ads", label: "Advertenties" },
  { id: "hero", label: "Hero / website" },
  { id: "general", label: "Algemeen" },
];

export const VIDEO_ASPECT_PRESETS: { id: VideoAspectPreset; label: string; hint: string }[] = [
  { id: "reel_9_16", label: "9:16 Reel", hint: "TikTok, Reels, Stories" },
  { id: "feed_1_1", label: "1:1 Feed", hint: "Vierkante feed" },
  { id: "feed_4_5", label: "4:5 Portrait", hint: "Instagram portrait" },
  { id: "hero_16_9", label: "16:9 Hero", hint: "Website, YouTube bumper" },
  { id: "ads_9_16", label: "9:16 Ads", hint: "Meta vertical" },
  { id: "ads_1_1", label: "1:1 Ads", hint: "Meta square" },
];

export function aspectPresetLabel(id: VideoAspectPreset): string {
  return VIDEO_ASPECT_PRESETS.find((item) => item.id === id)?.label ?? id;
}
