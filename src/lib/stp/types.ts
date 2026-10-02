import type { StpClaim, StpCriterionKind, StpDimension, StpDisposition, StpRating, StpStep } from "@/lib/stp/constants";

export type StpRef = {
  ref_type: string;
  ref_id: string | null;
  label: string;
  excerpt: string;
  slot: string;
};

export type StpScore = {
  dimension: StpDimension;
  rating: StpRating;
  note: string;
  assumption: string;
};

export type StpSegment = {
  id: string;
  name: string;
  description: string;
  need: string;
  traits: string;
  geography: string;
  trigger_text: string;
  offering: string;
  include_criteria: string;
  exclude_criteria: string;
  assumptions: string;
  open_question: string;
  hypothesis: boolean;
  disposition: StpDisposition;
  exclusion_reason: string;
  overlap_note: string;
  manual_lock: boolean;
  origin: "ai" | "manual";
  ai_state: "none" | "proposed" | "accepted" | "rejected";
  ai_payload: Record<string, unknown>;
  archived_at: string | null;
  sort_order: number;
  updated_at: string;
  scores: StpScore[];
  refs: StpRef[];
};

export type StpCriterion = {
  id: string;
  kind: StpCriterionKind;
  body: string;
  sort_order: number;
};

export type StpVersion = {
  id: string;
  version_number: number;
  status: "not_started" | "draft" | "in_review" | "approved" | "needs_revision";
  current_step: StpStep;
  offering: string;
  geography: string;
  scope_note: string;
  scope_confirmed: boolean;
  segments_confirmed: boolean;
  target_confirmed: boolean;
  position_confirmed: boolean;
  target_motivation: string;
  preference_note: string;
  preference_tradeoffs: string;
  preference_risks: string;
  primary_segment_id: string | null;
  audience: string;
  problem: string;
  promise: string;
  distinction: string;
  evidence_text: string;
  position_sentence: string;
  claim_status: StpClaim;
  icp_name: string;
  icp_summary: string;
  icp_sector: string;
  icp_stage: string;
  icp_size: string;
  icp_structure: string;
  icp_tech: string;
  icp_problem: string;
  icp_need: string;
  icp_outcome: string;
  icp_trigger: string;
  icp_inaction: string;
  icp_budget: string;
  icp_capacity: string;
  icp_conditions: string;
  icp_timing: string;
  assumptions: string;
  open_questions: string;
  accepted_uncertainty: string;
  needs_review: boolean;
  review_note: string;
  ai_proposal: Record<string, unknown>;
  ai_generated_at: string | null;
  published_at: string | null;
  approved_at: string | null;
  updated_at: string;
  pestel_version_id: string | null;
  porter_version_id: string | null;
  five_c_version_id: string | null;
  swot_version_id: string | null;
  vrio_version_id: string | null;
  bcg_version_id: string | null;
  vc_version_id: string | null;
};

export type StpInputs = {
  tenant: { id: string; name: string; website: string | null; audit_goal: string };
  five_c_items: { id: string; c_key: string; title: string; finding: string; client_relevance: string }[];
  swot_items: { id: string; quadrant: string; statement: string }[];
  vrio_resources: { id: string; title: string; description: string }[];
  pestel_insights: { id: string; dimension: string; title: string; observation: string }[];
  porter_forces: { id: string; force_key: string; headline_factor: string; motivation: string }[];
  bcg_items: { id: string; title: string; market: string }[];
  vc_activities: { id: string; name: string; customer_value: string; execution: string }[];
  meetings: { id: string; title: string; text: string }[];
};

export type StpWorkbench = {
  version: StpVersion;
  segments: StpSegment[];
  criteria: StpCriterion[];
  inputs: StpInputs;
};

export type StpPublished = {
  published: boolean;
  version_number?: number;
  published_at?: string | null;
  icp_name?: string;
  icp_summary?: string;
  offering?: string;
  geography?: string;
  primary_name?: string;
  position_sentence?: string;
  promise?: string;
  distinction?: string;
  open_questions?: string;
  accepted_uncertainty?: string;
  criteria?: { kind: StpCriterionKind; body: string }[];
};
