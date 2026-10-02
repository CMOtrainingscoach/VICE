import type {
  VcBusinessType,
  VcCategory,
  VcEvidence,
  VcExecution,
  VcRefType,
  VcTimeBasis,
  VcVersionStatus,
} from "@/lib/value-chain/constants";

export type VcRef = {
  ref_type: VcRefType;
  ref_id: string | null;
  label: string;
  excerpt: string;
  interpretation: boolean;
};

export type VcSubactivity = {
  id: string;
  name: string;
  sort_order: number;
};

export type VcDependency = {
  id: string;
  to_activity_id: string | null;
  vrio_resource_id: string | null;
  partner_label: string;
  kind: string;
  description: string;
  evidence_level: VcEvidence;
};

export type VcActivity = {
  id: string;
  chain_id: string;
  name: string;
  category: VcCategory;
  description: string;
  inputs_text: string;
  outputs_text: string;
  customer_value: string;
  capabilities_note: string;
  owner_name: string;
  execution: VcExecution;
  time_value: string | null;
  time_unit: string;
  time_scope: string;
  time_basis: VcTimeBasis;
  time_source: string;
  bottleneck_observation: string;
  bottleneck_explanation: string;
  bottleneck_improvement: string;
  bottleneck_effect: string;
  bottleneck_motivation: string;
  open_question: string;
  question_status: string;
  question_answer: string;
  advisor_note: string;
  evidence_level: VcEvidence;
  not_applicable: boolean;
  na_reason: string;
  review_status: "pending" | "reviewed";
  needs_revision: boolean;
  revision_note: string;
  manual_lock: boolean;
  origin: string;
  ai_state: string;
  ai_description: string;
  ai_customer_value: string;
  ai_bottleneck: string;
  ai_open_question: string;
  sort_order: number;
  updated_at: string;
  refs: VcRef[];
  subactivities: VcSubactivity[];
  dependencies: VcDependency[];
};

export type VcChain = {
  id: string;
  offering: string;
  business_type: VcBusinessType;
  market: string;
  period_label: string;
  goal: string;
  scope_confirmed: boolean;
  needs_revision: boolean;
  sort_order: number;
  activities: VcActivity[];
};

export type VcLine = {
  id: string;
  import_id: string;
  row_index: number;
  account_code: string;
  description: string;
  amount: string | null;
  source_location: string;
  line_kind: "detail" | "subtotal" | "total";
  extract_status: "proposed" | "confirmed" | "excluded" | "uncertain";
  in_scope: boolean;
  out_scope_reason: string;
  is_revenue: boolean;
  uncertain: boolean;
  formula: boolean;
  possible_duplicate: boolean;
  category_label: string;
  owner_activity_id: string | null;
};

export type VcImport = {
  id: string;
  chain_id: string | null;
  file_kind: string;
  file_name: string;
  entity_label: string;
  period_label: string;
  currency: string;
  scale: "units" | "thousands" | "millions";
  figure_type: "actual" | "budget" | "forecast";
  scope_level: "company" | "department" | "product_group" | "service";
  status: string;
  lines: VcLine[];
};

export type VcAllocation = {
  id: string;
  line_id: string;
  activity_id: string;
  amount: string | null;
  method: string;
  motivation: string;
  formula: string;
  status: "proposed" | "confirmed";
};

export type VcAction = {
  id: string;
  activity_id: string | null;
  title: string;
  problem: string;
  expected_outcome: string;
  owner_name: string;
  evaluation: string;
  deadline: string;
  status: "proposed" | "confirmed" | "dismissed";
};

export type VcVersion = {
  id: string;
  version_number: number;
  status: VcVersionStatus;
  pestel_version_id: string | null;
  porter_version_id: string | null;
  five_c_version_id: string | null;
  swot_version_id: string | null;
  vrio_version_id: string | null;
  synthesis_text: string;
  synthesis_public: string;
  synthesis_reviewed: boolean;
  publish_financials: boolean;
  finance_deferred: boolean;
  cost_rate: string | null;
  cost_rate_confirmed: boolean;
  cost_rate_currency: string;
  cost_rate_unit: string;
  ai_generated_at: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type VcUpstreamVersion = { id: string; version_number: number; status?: string } | null;

export type VcInputs = {
  tenant: { id: string; name: string; website: string | null; audit_goal: string };
  swot_items: { id: string; quadrant: string; statement: string }[];
  five_c_items: { id: string; c_key: string; title: string; finding: string; client_relevance: string; evidence_level: string }[];
  five_c_synthesis: string | null;
  porter_forces: { id: string; force_key: string; intensity: string | null; headline_factor: string; motivation: string }[];
  porter_scope: { id: string; market_sector: string | null; synthesis_text: string } | null;
  pestel_insights: { id: string; dimension: string; title: string; observation: string }[];
  meetings: { id: string; title: string; text: string }[];
  documents: { id: string; kind: string; label: string; excerpt: string }[];
  vrio_resources: { id: string; title: string; description: string; outcome: string; evidence_level: string }[];
};

export type VcWorkbench = {
  version: VcVersion;
  finance_access: boolean;
  upstream: {
    pestel: VcUpstreamVersion;
    porter: VcUpstreamVersion;
    five_c: VcUpstreamVersion;
    swot: VcUpstreamVersion;
    vrio: VcUpstreamVersion;
    latest_vrio_approved: VcUpstreamVersion;
  };
  chains: VcChain[];
  imports: VcImport[];
  allocations: VcAllocation[];
  actions: VcAction[];
  inputs: VcInputs;
};
