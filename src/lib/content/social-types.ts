export type SocialChannel = "instagram" | "linkedin" | "facebook" | "tiktok" | "x";
export type SocialFormat = "single" | "carousel" | "reel";
export type SocialTopicMode = "manual" | "blog" | "meeting";
export type JobStatus = "idle" | "queued" | "running" | "ready" | "failed";

/** Slide plan for carousel visual generation (client + action payload). */
export type SocialCarouselSlide = {
  id: string;
  title: string;
  subject: string;
};

export type SocialPostAsset = {
  id: string;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  kind: "ai" | "upload";
  prompt: string;
  styleSummary: string;
  altText: string;
  sortOrder: number;
  createdAt: string;
  url: string | null;
};

export type SocialPostConcept = {
  id: string;
  tenantId: string;
  channels: SocialChannel[];
  format: SocialFormat;
  topicMode: SocialTopicMode;
  topicText: string;
  blogConceptId: string | null;
  meetingRecordingId: string | null;
  caption: string;
  hashtags: string;
  language: string;
  brandId: string | null;
  brandVersionNumber: number | null;
  brandVoiceSnapshot: string;
  brandVisualSnapshot: Record<string, unknown>;
  selectedAssetId: string | null;
  selectedAsset: SocialPostAsset | null;
  assets: SocialPostAsset[];
  textJobStatus: JobStatus;
  textJobError: string;
  imageJobStatus: JobStatus;
  imageJobError: string;
  textAiBaseline: { caption?: string; hashtags?: string } | null;
  buyerPersonaId: string | null;
  brandCharacterId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialPostConceptSummary = {
  id: string;
  caption: string;
  topicText: string;
  format: SocialFormat;
  channels: SocialChannel[];
  updatedAt: string;
};

export const SOCIAL_CHANNELS: { id: SocialChannel; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
];

export const SOCIAL_FORMATS: { id: SocialFormat; label: string; hint: string }[] = [
  { id: "single", label: "Single post", hint: "Eén beeld, vierkant of staand." },
  { id: "carousel", label: "Carrousel", hint: "Meerdere slides in één post." },
  { id: "reel", label: "Reel", hint: "Verticaal formaat (9:16). Video volgt later." },
];

export const SOCIAL_MIGRATION =
  "Pas migratie 20260330135300_social_post_concepts.sql toe in de Supabase SQL-editor, na 20260330135200.";
