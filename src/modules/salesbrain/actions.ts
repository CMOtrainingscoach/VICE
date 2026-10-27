"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import type { LeadgenProspectRow } from "@/lib/leadgen/types";
import {
  exampleFirstMarketerFormSchema,
  exampleFirstMarketerWorkflow,
} from "@/lib/salesbrain/graph/example-first-marketer";
import { canPublish, validateWorkflowGraph } from "@/lib/salesbrain/graph/validate";
import type { SbWorkflowDefinition } from "@/lib/salesbrain/graph/types";
import { salesbrainFixturesEnabled } from "@/lib/salesbrain/flags";
import {
  fixtureGraphJson,
  fixtureRunDetail,
  fixtureRuns,
  fixtureWorkflows,
} from "@/lib/salesbrain/fixtures";
import { runSalesbrainWorkerForRun } from "@/lib/salesbrain/trigger-worker";
import {
  SALESBRAIN_MIGRATION,
  type SbMarketInsight,
  type SbRunDetail,
  type SbRunSummary,
  type SbWorkflowDetail,
  type SbWorkflowSummary,
} from "@/lib/salesbrain/types";
import type { SbClientFormSchema } from "@/lib/salesbrain/graph/types";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /sb_|list_sb|create_sb|get_sb|publish_sb|schema cache|does not exist/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? SALESBRAIN_MIGRATION : message;
}

async function authedAdmin() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

async function authedTenant(tenantId: string) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: membership } = await supabase.schema("app").from("my_tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!membership) {
    await requirePlatformAdminMfa(session);
  }
  return supabase;
}

function revalidateSb(tenantId: string) {
  revalidatePath(leadgenBasePath(tenantId));
}

export async function listSbWorkflowsAction(
  tenantId: string,
  options?: { includeArchived?: boolean },
): Promise<ActionResult<SbWorkflowSummary[]>> {
  if (salesbrainFixturesEnabled()) return { ok: true, data: fixtureWorkflows() };
  const supabase = await authedTenant(tenantId);
  const { data, error } = await supabase.schema("app").rpc("list_sb_workflows", {
    p_tenant_id: tenantId,
    p_include_archived: options?.includeArchived ?? false,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const list = Array.isArray(parsed) ? parsed : [];
  return {
    ok: true,
    data: list.map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        purpose: String(r.purpose ?? ""),
        status: String(r.status ?? "draft") as SbWorkflowSummary["status"],
        updatedAt: String(r.updatedAt ?? r.updated_at ?? ""),
        publishedVersionId: r.publishedVersionId ? String(r.publishedVersionId) : null,
        lastTestAt: null,
      };
    }),
  };
}

export async function publishDefaultWorkflowAction(tenantId: string): Promise<ActionResult> {
  const graph = exampleFirstMarketerWorkflow();
  const form = exampleFirstMarketerFormSchema();
  const issues = validateWorkflowGraph(graph);
  if (!canPublish(graph)) {
    return { ok: false, error: issues[0]?.message ?? "Workflow ongeldig" };
  }
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedAdmin();
  const ensured = await supabase.schema("app").rpc("ensure_default_sb_workflow", { p_tenant_id: tenantId });
  if (ensured.error) return { ok: false, error: migrationError(ensured.error.message) };
  const wfId = String(ensured.data);
  const { error } = await supabase.schema("app").rpc("publish_sb_workflow", {
    p_workflow_id: wfId,
    p_graph: graph,
    p_form_schema: form,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function publishWorkflowGraphAction(
  tenantId: string,
  workflowId: string,
  graph: SbWorkflowDefinition,
  formSchema: ReturnType<typeof exampleFirstMarketerFormSchema>,
): Promise<ActionResult> {
  const issues = validateWorkflowGraph(graph);
  if (!canPublish(graph)) {
    return { ok: false, error: issues[0]?.message ?? "Workflow ongeldig" };
  }
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedAdmin();
  const { error } = await supabase.schema("app").rpc("publish_sb_workflow", {
    p_workflow_id: workflowId,
    p_graph: graph,
    p_form_schema: formSchema,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function saveWorkflowDraftAction(
  tenantId: string,
  workflowId: string,
  graph: SbWorkflowDefinition,
  formSchema: ReturnType<typeof exampleFirstMarketerFormSchema>,
): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedAdmin();
  const { error } = await supabase.schema("app").rpc("save_sb_workflow_draft", {
    p_workflow_id: workflowId,
    p_graph: graph,
    p_form_schema: formSchema,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function createSbWorkflowAction(
  tenantId: string,
  payload: { name: string; purpose?: string; template?: "first_marketer" | "blank" },
): Promise<ActionResult<{ id: string }>> {
  if (salesbrainFixturesEnabled()) return { ok: true, data: { id: fixtureWorkflows()[0].id } };
  const graph =
    payload.template === "blank" ? { schemaVersion: 1 as const, nodes: [], edges: [] } : exampleFirstMarketerWorkflow();
  const form = exampleFirstMarketerFormSchema();
  const supabase = await authedAdmin();
  const { data, error } = await supabase.schema("app").rpc("create_sb_workflow", {
    p_tenant_id: tenantId,
    p_name: payload.name,
    p_purpose: payload.purpose ?? "",
    p_draft_graph: graph,
    p_form_schema: form,
  });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Workflow aanmaken mislukt") };
  revalidateSb(tenantId);
  return { ok: true, data: { id: String(data) } };
}

export async function getSbWorkflowAction(workflowId: string): Promise<ActionResult<SbWorkflowDetail | null>> {
  if (salesbrainFixturesEnabled()) {
    const w = fixtureWorkflows()[0];
    return {
      ok: true,
      data: {
        ...w,
        tenantId: "",
        draftGraph: fixtureGraphJson(),
        draftFormSchema: exampleFirstMarketerFormSchema(),
      },
    };
  }
  const supabase = await authedAdmin();
  const { data, error } = await supabase.schema("app").rpc("get_sb_workflow", { p_workflow_id: workflowId });
  if (error) return { ok: false, error: migrationError(error.message) };
  if (!data) return { ok: true, data: null };
  const r = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      id: String(r.id),
      tenantId: String(r.tenantId),
      name: String(r.name ?? ""),
      purpose: String(r.purpose ?? ""),
      status: String(r.status ?? "draft") as SbWorkflowDetail["status"],
      updatedAt: String(r.updatedAt ?? ""),
      publishedVersionId: r.publishedVersionId ? String(r.publishedVersionId) : null,
      lastTestAt: null,
      draftGraph: (r.draftGraph as SbWorkflowDetail["draftGraph"]) ?? exampleFirstMarketerWorkflow(),
      draftFormSchema: (r.draftFormSchema as SbClientFormSchema) ?? exampleFirstMarketerFormSchema(),
    },
  };
}

export async function archiveSbWorkflowAction(tenantId: string, workflowId: string): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedAdmin();
  const { error } = await supabase.schema("app").rpc("archive_sb_workflow", { p_workflow_id: workflowId });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  revalidatePath(`${leadgenBasePath(tenantId)}/workflows`);
  return { ok: true };
}

export async function restoreSbWorkflowAction(tenantId: string, workflowId: string): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedAdmin();
  const { error } = await supabase.schema("app").rpc("restore_sb_workflow", { p_workflow_id: workflowId });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function updateSbWorkflowMetaAction(
  tenantId: string,
  workflowId: string,
  name: string,
  purpose: string,
): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedAdmin();
  const { error } = await supabase.schema("app").rpc("update_sb_workflow_meta", {
    p_workflow_id: workflowId,
    p_name: name,
    p_purpose: purpose,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function listSbRunsAction(
  tenantId: string,
  options?: { includeDeleted?: boolean },
): Promise<ActionResult<SbRunSummary[]>> {
  if (salesbrainFixturesEnabled()) return { ok: true, data: fixtureRuns() };
  const supabase = await authedTenant(tenantId);
  const { data, error } = await supabase.schema("app").rpc("list_sb_runs", {
    p_tenant_id: tenantId,
    p_include_deleted: options?.includeDeleted ?? false,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const parsedRuns = typeof data === "string" ? JSON.parse(data) : data;
  const list = Array.isArray(parsedRuns) ? parsedRuns : [];
  return {
    ok: true,
    data: list.map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        workflowName: String(r.workflowName ?? ""),
        status: String(r.status ?? "queued") as SbRunSummary["status"],
        isTest: Boolean(r.isTest),
        prospectCount: Number(r.prospectCount ?? 0),
        insightCount: Number(r.insightCount ?? 0),
        createdAt: String(r.createdAt ?? ""),
        updatedAt: String(r.updatedAt ?? ""),
        deletedAt: r.deletedAt ? String(r.deletedAt) : null,
      };
    }),
  };
}

export async function softDeleteSbRunAction(tenantId: string, runId: string): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedTenant(tenantId);
  const { error } = await supabase.schema("app").rpc("soft_delete_sb_run", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function renameSbRunAction(tenantId: string, runId: string, name: string): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedTenant(tenantId);
  const { error } = await supabase.schema("app").rpc("update_sb_run_name", { p_run_id: runId, p_name: name });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateSb(tenantId);
  return { ok: true };
}

export async function createSbRunAction(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  if (salesbrainFixturesEnabled()) {
    return { ok: true, data: { id: fixtureRuns()[0].id } };
  }
  const supabase = await authedTenant(tenantId);

  const { data, error } = await supabase.schema("app").rpc("create_sb_run", {
    p_tenant_id: tenantId,
    p_payload: payload,
  });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Run aanmaken mislukt") };
  const row = data as Record<string, unknown>;
  const runId = String(row.id);
  after(async () => {
    try {
      await runSalesbrainWorkerForRun(runId);
    } catch (e) {
      console.error("[salesbrain] worker failed", runId, e);
    }
  });
  revalidateSb(tenantId);
  return { ok: true, data: { id: runId } };
}

export async function getSbRunAction(runId: string): Promise<ActionResult<SbRunDetail | null>> {
  if (salesbrainFixturesEnabled()) return { ok: true, data: fixtureRunDetail(runId) };
  const supabase = await createClient();
  await requireSession();
  const { data, error } = await supabase.schema("app").rpc("get_sb_run", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  if (!data) return { ok: true, data: null };
  const r = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      id: String(r.id),
      name: String(r.name ?? ""),
      workflowName: "",
      status: String(r.status ?? "queued") as SbRunDetail["status"],
      isTest: Boolean(r.isTest),
      prospectCount: Number(r.prospectCount ?? 0),
      insightCount: Number(r.insightCount ?? 0),
      createdAt: String(r.createdAt ?? ""),
      updatedAt: String(r.updatedAt ?? ""),
      progress: (r.progress as SbRunDetail["progress"]) ?? { phase: "", message: "" },
      errorMessage: r.errorMessage ? String(r.errorMessage) : null,
      inputs: (r.inputs as Record<string, unknown>) ?? {},
      workflowVersionId: String(r.workflowVersionId ?? ""),
    },
  };
}

export async function listSbProspectsAction(runId: string): Promise<ActionResult<LeadgenProspectRow[]>> {
  if (salesbrainFixturesEnabled()) {
    const { fixtureProspectRows } = await import("@/lib/leadgen/fixtures");
    return { ok: true, data: fixtureProspectRows().slice(0, 2) };
  }
  const supabase = await createClient();
  await requireSession();
  const { data, error } = await supabase.schema("app").rpc("list_sb_run_prospects", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  const parsedP = typeof data === "string" ? JSON.parse(data) : data;
  const rows = Array.isArray(parsedP) ? parsedP : [];
  return {
    ok: true,
    data: rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        runProspectId: String(row.runProspectId ?? row.id),
        displayName: String(row.displayName ?? ""),
        websiteUrl: row.websiteUrl ? String(row.websiteUrl) : null,
        websiteHost: row.websiteHost ? String(row.websiteHost) : null,
        municipality: null,
        distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
        geoEligible: Boolean(row.geoEligible),
        geoVerified: Boolean(row.geoVerified),
        email: null,
        phone: null,
        contactPageUrl: null,
        contactStatus: String(row.contactStatus ?? "to_contact") as LeadgenProspectRow["contactStatus"],
        sourceCount: Number(row.sourceCount ?? 1),
        assessedAt: null,
        assessmentSummary: row.assessmentSummary ? String(row.assessmentSummary) : undefined,
        signals: Array.isArray(row.signals) ? (row.signals as LeadgenProspectRow["signals"]) : undefined,
        limitations: Array.isArray(row.limitations) ? (row.limitations as string[]) : undefined,
      };
    }),
  };
}

export async function listSbInsightsAction(runId: string): Promise<ActionResult<SbMarketInsight[]>> {
  if (salesbrainFixturesEnabled()) {
    return {
      ok: true,
      data: [
        {
          id: "fix-insight",
          title: "Demo-inzicht",
          summary: "Fixture — geen live data.",
          provenance: "fixture",
          sources: [],
        },
      ],
    };
  }
  const supabase = await createClient();
  await requireSession();
  const { data, error } = await supabase.schema("app").rpc("list_sb_run_insights", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const rows = Array.isArray(parsed) ? parsed : [];
  return {
    ok: true,
    data: rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        summary: String(row.summary ?? ""),
        provenance: String(row.provenance ?? ""),
        sources: Array.isArray(row.sources) ? (row.sources as SbMarketInsight["sources"]) : [],
      };
    }),
  };
}

export async function ensureSbWorkerAction(runId: string): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_sb_run", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  const r = data as Record<string, unknown> | null;
  if (!r || String(r.status) !== "queued") return { ok: true };
  after(async () => {
    await runSalesbrainWorkerForRun(runId);
  });
  return { ok: true };
}

export async function submitSbFeedbackAction(
  tenantId: string,
  payload: { runId: string; prospectId?: string; kind: string; reason?: string },
): Promise<ActionResult> {
  if (salesbrainFixturesEnabled()) return { ok: true };
  const supabase = await authedTenant(tenantId);
  const { error } = await supabase.schema("app").rpc("insert_sb_feedback", {
    p_tenant_id: tenantId,
    p_run_id: payload.runId,
    p_prospect_id: payload.prospectId ?? "00000000-0000-0000-0000-000000000000",
    p_kind: payload.kind,
    p_reason: payload.reason ?? "",
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  return { ok: true };
}

export async function getWorkflowGraphForEditorAction(
  tenantId: string,
): Promise<ActionResult<SbWorkflowDefinition>> {
  if (salesbrainFixturesEnabled()) return { ok: true, data: fixtureGraphJson() };
  void tenantId;
  return { ok: true, data: exampleFirstMarketerWorkflow() };
}
