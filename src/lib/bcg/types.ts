import type {
  BcgEvidence,
  BcgGrowthMethod,
  BcgItemKind,
  BcgMeasureBasis,
  BcgOverlapMode,
  BcgPeriodKind,
  BcgRefType,
  BcgScale,
  BcgShareMethod,
  BcgVersionStatus,
} from "@/lib/bcg/constants";

export type BcgRef = {
  ref_type: BcgRefType;
  ref_id: string | null;
  label: string;
  excerpt: string;
  slot: "market" | "growth" | "share" | "general";
};

export type BcgAiPayload = {
  market_definition?: string;
  geography?: string;
  segment?: string;
  period_label?: string;
  measure_basis?: string;
  growth_method?: string;
  growth_percent?: string;
  size_previous?: string;
  size_current?: string;
  share_method?: string;
  own_share?: string;
  leader_share?: string;
  own_amount?: string;
  leader_amount?: string;
  leader_name?: string;
  open_question?: string;
  conflict?: string;
  growth_evidence?: string;
  share_evidence?: string;
  refs?: BcgRef[];
};

export type BcgItem = {
  id: string;
  title: string;
  description: string;
  kind: BcgItemKind;
  origin: "five_c" | "dossier" | "manual" | "ai";
  five_c_item_id: string | null;
  parent_item_id: string | null;
  overlap_key: string;
  overlap_mode: BcgOverlapMode;
  selected: boolean;
  exclusion_reason: string;
  market_definition: string;
  geography: string;
  segment: string;
  period_label: string;
  period_kind: BcgPeriodKind | "";
  measure_basis: BcgMeasureBasis | "";
  currency: string;
  unit_label: string;
  scope_confirmed: boolean;
  growth_method: BcgGrowthMethod;
  growth_percent: string | null;
  size_previous: string | null;
  size_current: string | null;
  size_scale: BcgScale;
  growth_evidence: BcgEvidence | "";
  share_method: BcgShareMethod;
  own_share: string | null;
  leader_share: string | null;
  own_amount: string | null;
  leader_amount: string | null;
  amount_scale: BcgScale;
  client_is_leader: boolean;
  leader_name: string;
  share_evidence: BcgEvidence | "";
  figures_conflict: string;
  conflict_accepted: boolean;
  figures_confirmed: boolean;
  manual_lock: boolean;
  advisor_note: string;
  open_question: string;
  question_status: "open" | "queued_meeting" | "answered";
  gap_reason: string;
  review_status: "pending" | "reviewed";
  needs_revision: boolean;
  revision_note: string;
  reviewed_at: string | null;
  ai_state: "none" | "proposed" | "accepted" | "rejected";
  ai_payload: BcgAiPayload;
  ai_generated_at: string | null;
  sort_order: number;
  updated_at: string;
  refs: BcgRef[];
};

export type BcgVersion = {
  id: string;
  version_number: number;
  status: BcgVersionStatus;
  scope_label: string;
  market_label: string;
  geography: string;
  segment: string;
  period_label: string;
  period_kind: BcgPeriodKind | "";
  measure_basis: BcgMeasureBasis | "";
  currency: string;
  unit_label: string;
  growth_threshold: string | null;
  growth_threshold_note: string;
  growth_threshold_source: string;
  share_threshold: string | null;
  thresholds_confirmed: boolean;
  qualitative: boolean;
  qualitative_reason: string;
  synthesis_text: string;
  synthesis_reviewed: boolean;
  publish_figures: boolean;
  published_at: string | null;
  ai_questions: string[];
  ai_generated_at: string | null;
  vrio_version_id: string | null;
  swot_version_id: string | null;
  five_c_version_id: string | null;
  porter_version_id: string | null;
  pestel_version_id: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type BcgUpstreamVersion = {
  id: string;
  version_number: number;
  status?: string;
};

export type BcgScopeSummary = {
  id: string;
  version_number: number;
  status: BcgVersionStatus;
  scope_label: string;
};

export type BcgHistoryRow = {
  id: string;
  item_id: string | null;
  decision: string;
  created_at: string;
};

export type BcgInputs = {
  tenant: { id: string; name: string; website: string | null; audit_goal: string };
  swot_items: { id: string; quadrant: string; statement: string }[];
  five_c_items: { id: string; c_key: string; title: string; finding: string; client_relevance: string }[];
  five_c_synthesis: string | null;
  porter_forces: { id: string; force_key: string; intensity: string; headline_factor: string; motivation: string }[];
  porter_scope: { id: string; market_sector: string; known_competitors: { name: string }[]; synthesis_text: string } | null;
  pestel_insights: { id: string; dimension: string; title: string; observation: string }[];
  vrio_resources: { id: string; title: string; description: string; outcome: string }[];
  meetings: { id: string; title: string; created_at: string; text: string }[];
  documents: { id: string; kind: string; label: string; excerpt: string }[];
};

export type BcgWorkbench = {
  version: BcgVersion;
  upstream: {
    vrio: BcgUpstreamVersion | null;
    swot: BcgUpstreamVersion | null;
    five_c: BcgUpstreamVersion | null;
    porter: BcgUpstreamVersion | null;
    pestel: BcgUpstreamVersion | null;
  };
  items: BcgItem[];
  scopes: BcgScopeSummary[];
  history: BcgHistoryRow[];
  inputs: BcgInputs;
};

export type BcgPublishedItem = {
  title: string;
  market_definition: string;
  geography: string;
  segment: string;
  period_label: string;
  measure_basis: string;
  placeable: boolean;
  gap_reason: string;
  open_question: string;
  growth: number | null;
  relative: number | null;
  growth_evidence: string;
  share_evidence: string;
};

export type BcgPublished = {
  published: boolean;
  version_number?: number;
  published_at?: string | null;
  scope_label?: string;
  market_label?: string;
  period_label?: string;
  period_kind?: string;
  measure_basis?: string;
  qualitative?: boolean;
  qualitative_reason?: string;
  synthesis?: string;
  figures_included?: boolean;
  growth_threshold?: number | null;
  share_threshold?: number | null;
  items?: BcgPublishedItem[];
};
