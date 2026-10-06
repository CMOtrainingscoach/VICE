import type { BrandDimensionKey, BrandJudgement, BrandModel, BrandStep, EvidenceStatus, PriorityKind } from "@/lib/brand/constants";

export type BrandVersion = {
  id: string;
  version_number: number;
  status: "not_started" | "draft" | "approved";
  current_step: BrandStep;
  model: BrandModel;
  stp_version_id: string | null;
  persona_version_id: string | null;
  website_url: string;
  period_label: string;
  research_availability: "uploaded" | "linked" | "unavailable" | "unknown";
  scope_note: string;
  verdict: string;
  strongest: string;
  weakest: string;
  unassessed: string;
  gap_summary: string;
  positioning_intended: string;
  perception_observed: string;
  accepted_uncertainty: string;
  open_questions: string;
  sources_confirmed: boolean;
  website_confirmed: boolean;
  image_confirmed: boolean;
  needs_review: boolean;
  review_note: string;
  published_at: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type BrandLinks = {
  stp: {
    present: boolean;
    approved?: boolean;
    version_number?: number;
    name?: string;
    sentence?: string;
    offering?: string;
    geography?: string;
    sector?: string;
  };
  personas: {
    present: boolean;
    confirmed?: boolean;
    version_number?: number;
    people: { id: string; role_title: string; audience_rank: string; hypothesis: boolean }[];
  };
  journeys: { confirmed?: boolean; count: number };
};

export type BrandSource = {
  id: string;
  kind: "upload" | "note" | "public";
  material_type: string;
  label: string;
  storage_path: string;
  mime: string;
  period_label: string;
  currency: "current" | "historical" | "unknown";
  channel: string;
  audience: string;
  note: string;
  status: "stored" | "ready" | "partial" | "failed";
  error_message: string;
  excerpt: string;
  source_url: string;
  url?: string;
};

export type BrandPage = {
  id: string;
  url: string;
  role: string;
  included: boolean;
  fetched_at: string | null;
  status: "pending" | "ready" | "failed" | "excluded";
  error_message: string;
  excerpt: string;
  screenshot_path?: string;
  screenshot_url?: string;
};

export type BrandFinding = {
  id: string;
  page_id: string | null;
  source_id: string | null;
  lens: "visual" | "text" | "journey";
  observation: string;
  meaning: string;
  proposal: string;
  hypothesis: boolean;
  persona_label: string;
  phase_label: string;
  pin_x?: number | null;
  pin_y?: number | null;
};

export type BrandDimension = {
  id: string;
  model: BrandModel;
  dimension_key: BrandDimensionKey | string;
  intended: string;
  observed: string;
  gap_note: string;
  evidence_status: EvidenceStatus;
  judgement: BrandJudgement | "";
  limits_note: string;
  open_question: string;
  hypothesis: boolean;
  manual_lock: boolean;
};

export type BrandPriority = {
  id: string;
  title: string;
  problem: string;
  action: string;
  outcome: string;
  validation_question: string;
  kind: PriorityKind;
  priority: "low" | "medium" | "high";
  reason: string;
  persona_label: string;
  phase_label: string;
};

export type BrandWorkbench = {
  version: BrandVersion;
  links: BrandLinks;
  tenant: { id: string; name: string; website: string };
  sources: BrandSource[];
  pages: BrandPage[];
  findings: BrandFinding[];
  dimensions: BrandDimension[];
  priorities: BrandPriority[];
};

export type BrandPublished = {
  published: boolean;
  version_number?: number;
  model?: BrandModel;
  verdict?: string;
  strongest?: string;
  weakest?: string;
  unassessed?: string;
  gap_summary?: string;
  positioning_intended?: string;
  perception_observed?: string;
  accepted_uncertainty?: string;
  priorities?: { title: string; problem: string; action: string; kind: PriorityKind; priority: string }[];
};
