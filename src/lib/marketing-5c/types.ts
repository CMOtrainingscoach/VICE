import type {
  FiveCContentType,
  FiveCEvidenceLevel,
  FiveCGapStatus,
  FiveCKey,
  FiveCRefType,
  FiveCReview,
  FiveCVersionStatus,
} from "@/lib/marketing-5c/constants";

export type FiveCRef = {
  ref_type: FiveCRefType;
  ref_id: string | null;
  ref_version_id?: string | null;
  label: string;
  excerpt: string;
};

export type FiveCItem = {
  id: string;
  c_key: FiveCKey;
  title: string;
  finding: string;
  client_relevance: string;
  content_type: FiveCContentType;
  evidence_level: FiveCEvidenceLevel;
  qualifier: string;
  advisor_note: string;
  open_question: string;
  gap_reason: string;
  gap_status: FiveCGapStatus;
  gap_answer: string;
  origin: "ai" | "manual";
  unsupported: boolean;
  unsupported_reason: string;
  review_status: FiveCReview;
  reject_reason: string;
  sort_order: number;
  created_at: string;
  refs: FiveCRef[];
};

export type FiveCSection = {
  id: string;
  c_key: FiveCKey;
  summary: string;
  review_status: FiveCReview;
  gaps_accepted: boolean;
  gaps_note: string;
  needs_revision: boolean;
  reviewed_at: string | null;
};

export type FiveCSourceRef = {
  ref_type: FiveCRefType;
  ref_id: string | null;
  label: string;
  date?: string | null;
};

export type FiveCContradiction = {
  id: string;
  title: string;
  description: string;
  source_a: FiveCSourceRef;
  source_b: FiveCSourceRef;
  affected_keys: FiveCKey[];
  resolution: "open" | "clarified" | "a_outdated" | "b_outdated";
  resolution_note: string;
  resolved_at: string | null;
};

export type FiveCCoherencePoint = {
  statement: string;
  refs: FiveCSourceRef[];
};

export type FiveCUpstreamRequest = {
  id: string;
  target: "pestel" | "porter";
  c_key: FiveCKey | null;
  note: string;
  status: "open" | "done";
  created_at: string;
};

export type FiveCUpstreamVersion = {
  id: string;
  version_number: number;
  status?: string;
};

export type FiveCVersion = {
  id: string;
  version_number: number;
  status: FiveCVersionStatus;
  pestel_version_id: string | null;
  porter_version_id: string | null;
  excluded_inputs: string[];
  synthesis_text: string;
  synthesis_reviewed: boolean;
  coherence_points: FiveCCoherencePoint[];
  ai_generated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type FiveCInputs = {
  tenant: { id: string; name: string; website: string | null; audit_goal: string };
  meetings: {
    id: string;
    title: string;
    review_status: string;
    created_at: string;
    text: string;
    notes: string;
  }[];
  pestel_inputs: {
    id: string;
    kind: "document" | "note";
    label: string;
    url: string | null;
    excerpt: string;
    created_at: string;
  }[];
  pestel_insights: {
    id: string;
    dimension: string;
    title: string;
    observation: string;
    client_relevance: string;
    evidence_level: string;
    insight_time_horizon: string;
    review_status: string;
  }[];
  pestel_scope: {
    geo_markets: string[];
    time_horizon: string;
    synthesis_text: string;
  } | null;
  porter_scope: {
    id: string;
    market_sector: string;
    offering_description: string;
    client_segment: string;
    geo_markets: string[];
    time_horizon: string;
    known_competitors: { name: string; url?: string }[];
    synthesis_text: string;
  } | null;
  porter_forces: {
    id: string;
    force_key: string;
    intensity: string;
    headline_factor: string;
    motivation: string;
    client_relevance: string;
    review_status: string;
  }[];
  porter_factors: {
    id: string;
    force_key: string;
    title: string;
    observation: string;
    effect: string;
    evidence_level: string;
  }[];
};

export type FiveCWorkbench = {
  version: FiveCVersion;
  upstream: {
    pestel: FiveCUpstreamVersion | null;
    porter: FiveCUpstreamVersion | null;
    latest_pestel_approved: FiveCUpstreamVersion | null;
    latest_porter_approved: FiveCUpstreamVersion | null;
  };
  sections: FiveCSection[];
  items: FiveCItem[];
  contradictions: FiveCContradiction[];
  upstreamRequests: FiveCUpstreamRequest[];
  inputs: FiveCInputs;
};
