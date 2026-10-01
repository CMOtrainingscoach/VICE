import type { PestelDimension, PestelVersionStatus } from "@/lib/pestel/constants";

export type PestelInsightSource = {
  id?: string;
  source_type: "website" | "document" | "meeting" | "manual";
  label: string;
  url?: string | null;
  publisher?: string | null;
  published_on?: string | null;
  accessed_on?: string | null;
  meeting_recording_id?: string | null;
  excerpt: string;
  meeting_offset_ms?: number | null;
  is_ai_interpretation?: boolean;
};

export type PestelInsight = {
  id: string;
  dimension: PestelDimension;
  title: string;
  observation: string;
  client_relevance: string;
  opportunity_risk: string;
  impact: string;
  impact_note: string;
  insight_time_horizon: string;
  evidence_level: string;
  advisor_note: string;
  origin: string;
  research_job_id?: string | null;
  review_status: string;
  reject_reason?: string | null;
  sort_order: number;
  sources: PestelInsightSource[];
};

export type PestelVersion = {
  id: string;
  version_number: number;
  status: PestelVersionStatus;
  market_sector: string;
  geo_markets: string[];
  time_horizon: string;
  offering_audience: string;
  research_question: string;
  results_stale: boolean;
  synthesis_text: string;
  synthesis_stale: boolean;
  synthesis_reviewed: boolean;
  updated_at: string;
};

export type PestelMeetingOption = {
  id: string;
  title: string;
  review_status: string;
};

export type PestelResearchInputKind = "meeting" | "website" | "document" | "note";

export type PestelResearchInput = {
  id?: string;
  kind: PestelResearchInputKind;
  meeting_recording_id?: string | null;
  label: string;
  url?: string | null;
  excerpt: string;
  sort_order?: number;
};

export type PestelResearchJob = {
  id: string;
  version_id: string;
  tenant_id: string;
  status: string;
  progress: {
    phase?: string;
    message?: string;
    dimensions_done?: string[];
    current_dimension?: string;
  };
  error_message: string | null;
  insights_created: number;
};

export type PestelWorkbench = {
  version: PestelVersion;
  insights: PestelInsight[];
  meetings: PestelMeetingOption[];
  researchInputs: PestelResearchInput[];
  activeResearchJob: PestelResearchJob | null;
};
