import type { DecisionRole, EvidenceLevel, PersonaStep } from "@/lib/persona/constants";

export type PersonaPortrait = {
  id: string;
  status: "queued" | "running" | "ready" | "failed";
  storage_path: string;
  provider?: "openai" | "upload" | string;
  error_message: string;
  created_at: string;
  url?: string;
};

export type PersonaRef = { ref_type: string; ref_id: string | null; label: string; excerpt: string };

export type Persona = {
  id: string;
  role_title: string;
  display_name: string;
  summary: string;
  decision_roles: DecisionRole[];
  relevance: string;
  goals: string;
  outcomes: string;
  responsibilities: string;
  success_criteria: string;
  pains: string;
  barriers: string;
  risks: string;
  consequences: string;
  triggers: string;
  decision_criteria: string;
  objections: string;
  info_needed: string;
  other_roles: string;
  touchpoints: string;
  questions: string;
  arguments: string;
  proof_needed: string;
  channels: string;
  assumptions: string;
  open_question: string;
  conflict_note: string;
  hypothesis: boolean;
  evidence_level: EvidenceLevel;
  active: boolean;
  audience_rank: "primary" | "secondary";
  manual_lock: boolean;
  origin: "ai" | "manual";
  ai_state: "none" | "proposed" | "accepted" | "rejected";
  ai_payload: Record<string, unknown>;
  overlap_note: string;
  illustration_prompt: string;
  selected_portrait_id: string | null;
  archived_at: string | null;
  sort_order: number;
  portraits: PersonaPortrait[];
  refs: PersonaRef[];
};

export type JourneyPhase = {
  id: string;
  name: string;
  goal: string;
  actions: string;
  questions: string;
  info_need: string;
  decision_criteria: string;
  barriers: string;
  next_step: string;
  touchpoints: string;
  channels: string;
  involved_persona_ids: string[];
  company_side: string;
  content_needed: string;
  assumption: string;
  open_question: string;
  emotion: string;
  improvement: string;
  proposed_action: string;
  contribution: string;
  owner_name: string;
  priority: "low" | "medium" | "high" | "unknown";
  hypothesis: boolean;
  sort_order: number;
  archived_at: string | null;
};

export type Journey = {
  id: string;
  kind: "current" | "desired";
  title: string;
  primary_persona_id: string | null;
  based_on_id: string | null;
  route_note: string;
  hypothesis: boolean;
  ai_proposal: { phases?: Record<string, unknown>[] };
  archived_at: string | null;
  phases: JourneyPhase[];
};

export type PersonaIcp = {
  present: boolean;
  approved?: boolean;
  id?: string;
  version_number?: number;
  name?: string;
  summary?: string;
  offering?: string;
  geography?: string;
  need?: string;
  sector?: string;
  stage?: string;
  sentence?: string;
  promise?: string;
};

export type PersonaVersion = {
  id: string;
  version_number: number;
  status: "not_started" | "draft" | "approved";
  current_step: PersonaStep;
  stp_version_id: string | null;
  personas_confirmed: boolean;
  journeys_confirmed: boolean;
  accepted_uncertainty: string;
  open_questions: string;
  needs_review: boolean;
  review_note: string;
  published_at: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type PersonaWorkbench = {
  version: PersonaVersion;
  icp: PersonaIcp;
  personas: Persona[];
  journeys: Journey[];
  inputs: {
    tenant: { id: string; name: string };
    five_c_items: { id: string; c_key: string; title: string; finding: string }[];
    meetings: { id: string; title: string; text: string }[];
  };
};

export type PersonaPublished = {
  published: boolean;
  version_number?: number;
  published_at?: string | null;
  open_questions?: string;
  accepted_uncertainty?: string;
  personas?: { id?: string; role_title: string; summary: string; audience_rank?: "primary" | "secondary"; storage_path: string; provider?: string; url?: string }[];
  journeys?: { kind: "current" | "desired"; title: string; primary_persona_id?: string | null; role_title?: string; phases: { name: string; goal: string; barriers: string; improvement: string }[] }[];
};
