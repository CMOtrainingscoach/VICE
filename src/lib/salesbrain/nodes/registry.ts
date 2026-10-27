import type { SbNodeType } from "@/lib/salesbrain/types";

export type NodeRegistryEntry = {
  type: SbNodeType;
  labelNl: string;
  readiness: "mvp" | "phase3" | "deferred";
  description: string;
};

export const NODE_REGISTRY: NodeRegistryEntry[] = [
  { type: "start", labelNl: "Start", readiness: "mvp", description: "Clientinputs en run-metadata" },
  { type: "client_context", labelNl: "Klantcontext", readiness: "mvp", description: "ICP/offer/brand slice" },
  { type: "web_research", labelNl: "Live webonderzoek", readiness: "mvp", description: "Tavily/Serper" },
  { type: "website_fetch", labelNl: "Website ophalen", readiness: "mvp", description: "SSRF-safe HTML" },
  { type: "job_ads", labelNl: "Vacatures", readiness: "mvp", description: "Job-ad discovery" },
  { type: "documents", labelNl: "Documenten", readiness: "mvp", description: "PDF/DOCX context" },
  { type: "normalize", labelNl: "Normaliseren", readiness: "mvp", description: "Dedupe kandidaten" },
  { type: "verify_evidence", labelNl: "Evidence verifiëren", readiness: "mvp", description: "Claim vs bron" },
  { type: "icp_filter", labelNl: "ICP-match", readiness: "mvp", description: "Fit + geo" },
  { type: "ai_analysis", labelNl: "AI-analyse", readiness: "mvp", description: "Bounded JSON" },
  { type: "results", labelNl: "Resultaten", readiness: "mvp", description: "Prospects of inzichten" },
  { type: "gsc_source", labelNl: "Search Console", readiness: "phase3", description: "Bestaande koppeling" },
  { type: "ga4_source", labelNl: "GA4", readiness: "phase3", description: "Aggregate metrics" },
  { type: "google_forms", labelNl: "Google Forms", readiness: "phase3", description: "Responses API + scopes" },
  { type: "trends_import", labelNl: "Trends (import)", readiness: "phase3", description: "Handmatige CSV/JSON" },
  { type: "newsletter", labelNl: "Newsletter", readiness: "deferred", description: "Binnenkort" },
];
