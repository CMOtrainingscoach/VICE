export type BlogMode = "new" | "rewrite";
export type BlogLength = "short" | "medium" | "long";
export type JobStatus = "idle" | "queued" | "running" | "ready" | "failed";

export type BlogVisual = {
  id: string;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  prompt: string;
  styleSummary: string;
  altText: string;
  brandVersionNumber: number | null;
  basedOnTitle: string;
  createdAt: string;
  url: string | null;
};

export type BlogConcept = {
  id: string;
  tenantId: string;
  mode: BlogMode;
  language: string;
  lengthKey: BlogLength;
  sourceText: string;
  title: string;
  bodyHtml: string;
  bodyPlain: string;
  wordCount: number;
  brandId: string | null;
  brandVersionNumber: number | null;
  brandVoiceSnapshot: string;
  brandVisualSnapshot: {
    tags?: string[];
    do?: string;
    avoid?: string;
    stylePrompt?: string;
  };
  selectedVisualId: string | null;
  selectedVisual: BlogVisual | null;
  visuals: BlogVisual[];
  textJobStatus: JobStatus;
  textJobError: string;
  imageJobStatus: JobStatus;
  imageJobError: string;
  createdAt: string;
  updatedAt: string;
};

export type BlogConceptSummary = {
  id: string;
  title: string | null;
  sourceText: string;
  updatedAt: string;
  wordCount: number;
  brandVersionNumber: number | null;
};

export type BrandVisualStyleOption = {
  id: string;
  name: string;
  tags: string[];
  do: string;
  avoid: string;
  stylePrompt: string;
};

export type BrandContext = {
  tenantName: string;
  brandName: string;
  versionNumber: number | null;
  approved: boolean;
  voice: string;
  hasVoice: boolean;
  hasVisual: boolean;
  visual: {
    tags: string[];
    do: string;
    avoid: string;
    stylePrompt: string;
  };
  styles: BrandVisualStyleOption[];
  colors: { name: string; hex: string; role: string }[];
  brandHref: string;
};

export const BLOG_MIGRATION =
  "Pas migratie 20260330134800 toe in de Supabase SQL-editor, na 20260330134700. Voor concept verwijderen: 20260330134900. Voor visual verwijderen: 20260330135000.";

export const LENGTH_LABELS: Record<BlogLength, string> = {
  short: "Kort",
  medium: "Gemiddeld",
  long: "Uitgebreid",
};
