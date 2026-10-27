import type { SbNodeType } from "@/lib/salesbrain/types";

export type SbPortType =
  | "ClientInputs"
  | "ClientContext"
  | "SearchHits"
  | "PageEvidence"
  | "JobSignals"
  | "DocumentEvidence"
  | "CompanyCandidates"
  | "VerifiedClaims"
  | "QualifiedProspects"
  | "MarketInsights"
  | "MetricObservations";

export type SbGraphNode = {
  id: string;
  type: SbNodeType;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
};

export type SbGraphEdge = {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
};

export type SbWorkflowDefinition = {
  schemaVersion: 1;
  nodes: SbGraphNode[];
  edges: SbGraphEdge[];
};

export type SbClientFormSchema = {
  schemaVersion: 1;
  steps: {
    id: "goal" | "sources" | "review";
    visible: boolean;
    fields: {
      key: string;
      type: "icp" | "text" | "location" | "radius" | "documents" | "optional_sources";
      required: boolean;
      label: string;
      bounds?: Record<string, unknown>;
    }[];
  }[];
};

export const NODE_OUTPUT_PORT: Partial<Record<SbNodeType, SbPortType>> = {
  start: "ClientInputs",
  client_context: "ClientContext",
  web_research: "SearchHits",
  website_fetch: "PageEvidence",
  job_ads: "JobSignals",
  documents: "DocumentEvidence",
  normalize: "CompanyCandidates",
  verify_evidence: "VerifiedClaims",
  icp_filter: "QualifiedProspects",
  ai_analysis: "VerifiedClaims",
  results: "QualifiedProspects",
  gsc_source: "MetricObservations",
  ga4_source: "MetricObservations",
  google_forms: "DocumentEvidence",
  trends_import: "MetricObservations",
};

export const NODE_INPUT_PORTS: Partial<Record<SbNodeType, SbPortType[]>> = {
  client_context: ["ClientInputs"],
  web_research: ["ClientContext"],
  job_ads: ["ClientContext"],
  documents: ["ClientInputs"],
  normalize: ["SearchHits", "JobSignals"],
  website_fetch: ["SearchHits"],
  verify_evidence: ["PageEvidence", "CompanyCandidates"],
  icp_filter: ["VerifiedClaims", "ClientContext"],
  ai_analysis: ["VerifiedClaims", "ClientContext", "MetricObservations", "QualifiedProspects"],
  results: ["QualifiedProspects", "MarketInsights", "VerifiedClaims"],
  gsc_source: [],
  ga4_source: [],
};
