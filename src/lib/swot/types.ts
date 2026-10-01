import type { SwotQuadrant, SwotRefType, SwotVersionStatus } from "@/lib/swot/constants";

export type SwotRef = {
  ref_type: SwotRefType;
  ref_id: string | null;
  label: string;
  excerpt: string;
};

export type SwotItem = {
  id: string;
  quadrant: SwotQuadrant;
  statement: string;
  origin: "ai" | "manual";
  sort_order: number;
  created_at: string;
  refs: SwotRef[];
};

export type SwotVersion = {
  id: string;
  version_number: number;
  status: SwotVersionStatus;
  pestel_version_id: string | null;
  porter_version_id: string | null;
  five_c_version_id: string | null;
  advisor_reviewed: boolean;
  adjustment_note: string;
  ai_generated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type SwotUpstreamVersion = {
  id: string;
  version_number: number;
  status?: string;
};

export type SwotInputs = {
  tenant: { id: string; name: string; website: string | null; audit_goal: string };
  meetings: { id: string; title: string; created_at: string; text: string }[];
  pestel_insights: {
    id: string;
    dimension: string;
    title: string;
    observation: string;
    client_relevance: string;
  }[];
  porter_forces: {
    id: string;
    force_key: string;
    headline_factor: string;
    motivation: string;
    client_relevance: string;
  }[];
  porter_scope: { id: string; market_sector: string; synthesis_text: string } | null;
  five_c_items: {
    id: string;
    c_key: string;
    title: string;
    finding: string;
    client_relevance: string;
  }[];
  five_c_synthesis: string | null;
};

export type SwotWorkbench = {
  version: SwotVersion;
  upstream: {
    pestel: SwotUpstreamVersion | null;
    porter: SwotUpstreamVersion | null;
    five_c: SwotUpstreamVersion | null;
    latest_five_c_approved: SwotUpstreamVersion | null;
  };
  items: SwotItem[];
  inputs: SwotInputs;
};
