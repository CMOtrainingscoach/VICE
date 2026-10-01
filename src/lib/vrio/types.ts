import type {
  VrioAiState,
  VrioAnswer,
  VrioCriterion,
  VrioEvidenceLevel,
  VrioOutcome,
  VrioQuestionStatus,
  VrioRefType,
  VrioResourceKind,
  VrioReview,
  VrioVersionStatus,
} from "@/lib/vrio/constants";

export type VrioRef = {
  ref_type: VrioRefType;
  ref_id: string | null;
  label: string;
  excerpt: string;
};

export type VrioAssessment = {
  id: string;
  criterion: VrioCriterion;
  answer: VrioAnswer;
  motivation: string;
  evidence_level: VrioEvidenceLevel;
  origin: "ai" | "manual";
  advisor_note: string;
  open_question: string;
  question_status: VrioQuestionStatus;
  question_answer: string;
  skipped_reason: string;
  confirmed: boolean;
  ai_state: VrioAiState;
  ai_answer: VrioAnswer | null;
  ai_motivation: string;
  ai_missing_evidence: string;
  reviewed_at: string | null;
  updated_at: string;
  refs: VrioRef[];
};

export type VrioResource = {
  id: string;
  title: string;
  description: string;
  kind: VrioResourceKind;
  origin: "swot" | "ai" | "manual";
  swot_item_id: string | null;
  selected: boolean;
  exclusion_reason: string;
  evidence_level: VrioEvidenceLevel;
  needs_clarification: boolean;
  clarification_note: string;
  partner_owned: boolean;
  access_note: string;
  market_context: string;
  review_status: VrioReview;
  needs_revision: boolean;
  revision_note: string;
  reviewed_at: string | null;
  sort_order: number;
  created_at: string;
  refs: VrioRef[];
  assessments: VrioAssessment[];
  outcome: VrioOutcome;
};

export type VrioPriority = {
  resource_id?: string;
  action: string;
  note: string;
};

export type VrioVersion = {
  id: string;
  version_number: number;
  status: VrioVersionStatus;
  swot_version_id: string | null;
  five_c_version_id: string | null;
  porter_version_id: string | null;
  pestel_version_id: string | null;
  synthesis_text: string;
  synthesis_reviewed: boolean;
  priorities: VrioPriority[];
  ai_generated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type VrioUpstreamVersion = {
  id: string;
  version_number: number;
  status?: string;
};

export type VrioInputs = {
  tenant: { id: string; name: string; website: string | null; audit_goal: string };
  swot_items: {
    id: string;
    quadrant: string;
    statement: string;
    origin: string;
    refs: VrioRef[];
  }[];
  five_c_items: {
    id: string;
    c_key: string;
    title: string;
    finding: string;
    client_relevance: string;
    evidence_level: string;
  }[];
  five_c_synthesis: string | null;
  porter_forces: {
    id: string;
    force_key: string;
    intensity: string;
    headline_factor: string;
    motivation: string;
    client_relevance: string;
  }[];
  porter_scope: {
    id: string;
    market_sector: string;
    known_competitors: { name: string; url?: string }[];
    synthesis_text: string;
  } | null;
  pestel_insights: {
    id: string;
    dimension: string;
    title: string;
    observation: string;
    client_relevance: string;
  }[];
  meetings: { id: string; title: string; created_at: string; text: string }[];
  documents: { id: string; kind: string; label: string; excerpt: string }[];
};

export type VrioWorkbench = {
  version: VrioVersion;
  upstream: {
    swot: VrioUpstreamVersion | null;
    five_c: VrioUpstreamVersion | null;
    porter: VrioUpstreamVersion | null;
    pestel: VrioUpstreamVersion | null;
    latest_swot_approved: VrioUpstreamVersion | null;
  };
  resources: VrioResource[];
  inputs: VrioInputs;
};
