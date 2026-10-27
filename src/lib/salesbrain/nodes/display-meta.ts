import type { SbNodeType } from "@/lib/salesbrain/types";

export type SbNodeDisplayMeta = {
  title: string;
  subtitle: string;
  paletteGroup?: "bronnen" | "verwerking" | "resultaat" | "trigger";
};

export const NODE_DISPLAY: Record<SbNodeType, SbNodeDisplayMeta> = {
  start: { title: "Klantinput", subtitle: "Starttrigger", paletteGroup: "trigger" },
  client_context: { title: "Klantcontext", subtitle: "ICP & strategie", paletteGroup: "verwerking" },
  web_research: { title: "Live webonderzoek", subtitle: "Realtime marktdata", paletteGroup: "bronnen" },
  website_fetch: { title: "Website ophalen", subtitle: "HTML-evidence", paletteGroup: "verwerking" },
  job_ads: { title: "Vacatures zoeken", subtitle: "Live vacaturemonitoring", paletteGroup: "bronnen" },
  documents: { title: "Documenten", subtitle: "Aanbod & klantkennis", paletteGroup: "bronnen" },
  normalize: { title: "Normaliseren", subtitle: "Dedupe kandidaten", paletteGroup: "verwerking" },
  verify_evidence: { title: "Controleer bewijs", subtitle: "Claim vs bron", paletteGroup: "verwerking" },
  icp_filter: { title: "Filter & match", subtitle: "ICP & geo", paletteGroup: "verwerking" },
  ai_analysis: { title: "AI-analyse", subtitle: "Bounded interpretatie", paletteGroup: "verwerking" },
  results: { title: "Prospectielijst", subtitle: "Output", paletteGroup: "resultaat" },
  gsc_source: { title: "Search Console", subtitle: "Zoekprestaties", paletteGroup: "bronnen" },
  ga4_source: { title: "GA4", subtitle: "Aggregate metrics", paletteGroup: "bronnen" },
  google_forms: { title: "Google Forms", subtitle: "Inzendingen", paletteGroup: "bronnen" },
  trends_import: { title: "Google Trends", subtitle: "Handmatige import", paletteGroup: "bronnen" },
  newsletter: { title: "Nieuwsbrief", subtitle: "Binnenkort", paletteGroup: "bronnen" },
};

export const PALETTE_BRONNEN: { type: SbNodeType; label: string; disabled?: boolean }[] = [
  { type: "web_research", label: "Zoekopdracht" },
  { type: "trends_import", label: "Google Trends" },
  { type: "gsc_source", label: "Search Console" },
  { type: "documents", label: "Documenten" },
  { type: "newsletter", label: "Nieuwsbrief", disabled: true },
  { type: "job_ads", label: "Vacatures zoeken" },
  { type: "google_forms", label: "Google Forms" },
  { type: "ga4_source", label: "GA4" },
];

export const PALETTE_VERWERKING: { type: SbNodeType; label: string }[] = [
  { type: "ai_analysis", label: "AI-analyse" },
  { type: "verify_evidence", label: "Controleer bewijs" },
  { type: "icp_filter", label: "Filter & match" },
];

export const PALETTE_RESULTAAT: { type: SbNodeType; label: string }[] = [
  { type: "results", label: "Prospectielijst" },
];
