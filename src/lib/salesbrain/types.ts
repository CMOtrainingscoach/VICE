export const SALESBRAIN_MIGRATION =
  "Pas migraties 20260330136400–36402 toe in Supabase, na 20260330136300.";

export type SbRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export type SbWorkflowStatus = "draft" | "published" | "archived";

export type SbNodeType =
  | "start"
  | "client_context"
  | "web_research"
  | "website_fetch"
  | "job_ads"
  | "documents"
  | "normalize"
  | "verify_evidence"
  | "icp_filter"
  | "ai_analysis"
  | "results"
  | "gsc_source"
  | "ga4_source"
  | "google_forms"
  | "trends_import"
  | "newsletter";

export type SbWorkflowSummary = {
  id: string;
  name: string;
  status: SbWorkflowStatus;
  purpose: string;
  updatedAt: string;
  publishedVersionId: string | null;
  lastTestAt: string | null;
};

export type SbRunSummary = {
  id: string;
  name: string;
  workflowName: string;
  status: SbRunStatus;
  isTest: boolean;
  prospectCount: number;
  insightCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SbRunDetail = SbRunSummary & {
  progress: {
    phase: string;
    message: string;
    discovered?: number;
    qualified?: number;
    warnings?: string[];
  };
  errorMessage: string | null;
  inputs: Record<string, unknown>;
  workflowVersionId: string;
};

export type SbGuidedStepId = "goal" | "sources" | "review" | "results";

export type SbMarketInsight = {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  sources: { label: string; url?: string }[];
};

export type SbFeedbackKind = "relevant" | "not_relevant" | "incorrect";
