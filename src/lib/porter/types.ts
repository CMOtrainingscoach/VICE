import type { PorterForceKey, PorterVersionStatus } from "@/lib/porter/constants";

export type PorterKnownCompetitor = {
  name: string;
  url?: string;
};

export type PorterForce = {
  id: string;
  force_key: PorterForceKey;
  intensity: string;
  motivation: string;
  client_relevance: string;
  advisor_note: string;
  headline_factor: string;
  review_status: string;
  sort_order: number;
  factor_count: number;
  source_count: number;
};

export type PorterPestelInsightSummary = {
  id: string;
  dimension: string;
  title: string;
  observation: string;
  client_relevance: string;
};

export type PorterVersion = {
  id: string;
  version_number: number;
  status: PorterVersionStatus;
  pestel_version_id: string | null;
  market_sector: string;
  offering_description: string;
  geo_markets: string[];
  client_segment: string;
  time_horizon: string;
  research_question: string;
  known_competitors: PorterKnownCompetitor[];
  results_stale: boolean;
  synthesis_text: string;
  synthesis_stale: boolean;
  synthesis_reviewed: boolean;
  updated_at: string;
};

export type PorterWorkbench = {
  version: PorterVersion;
  forces: PorterForce[];
  pestelContext: {
    version_id: string | null;
    version_number: number | null;
    approved: boolean;
    insights: PorterPestelInsightSummary[];
  };
};
