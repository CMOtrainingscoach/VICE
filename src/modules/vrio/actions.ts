"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import { SWOT_ROUTE } from "@/lib/swot/constants";
import { BCG_ROUTE, VRIO_ROUTE } from "@/lib/vrio/constants";
import { buildVrioCatalog } from "@/lib/vrio/input-catalog";
import { prepareVrioWithAi } from "@/lib/vrio/vrio-ai";
import type { VrioWorkbench } from "@/lib/vrio/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import {
  vrioAiProposalSchema,
  vrioApproveSchema,
  vrioAssessmentSchema,
  vrioMergeSchema,
  vrioPrepareSchema,
  vrioQuestionSchema,
  vrioResourceIdSchema,
  vrioResourceReviewSchema,
  vrioResourceSchema,
  vrioSelectionSchema,
  vrioSplitSchema,
  vrioSynthesisSchema,
  vrioVersionSchema,
} from "@/modules/vrio/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateVrio(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${BCG_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function loadVrioWorkbenchAction(
  tenantId: string,
): Promise<ActionResult<VrioWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_vrio_workbench", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: error.message };

  const raw = data as Record<string, unknown> & {
    version: VrioWorkbench["version"];
    upstream: VrioWorkbench["upstream"];
    inputs: VrioWorkbench["inputs"];
  };
  const inputs = raw.inputs;

  return {
    ok: true,
    data: {
      version: {
        ...raw.version,
        priorities: asArray(raw.version.priorities),
      },
      upstream: raw.upstream,
      resources: asArray<VrioWorkbench["resources"][number]>(raw.resources).map((r) => ({
        ...r,
        refs: asArray(r.refs),
        assessments: asArray<VrioWorkbench["resources"][number]["assessments"][number]>(
          r.assessments,
        ).map((a) => ({ ...a, refs: asArray(a.refs) })),
      })),
      inputs: {
        tenant: inputs.tenant,
        swot_items: asArray<VrioWorkbench["inputs"]["swot_items"][number]>(inputs.swot_items).map(
          (s) => ({ ...s, refs: asArray(s.refs) }),
        ),
        five_c_items: asArray(inputs.five_c_items),
        five_c_synthesis: inputs.five_c_synthesis ?? null,
        porter_forces: asArray(inputs.porter_forces),
        porter_scope:
          inputs.porter_scope ?
            {
              ...inputs.porter_scope,
              known_competitors: asArray(inputs.porter_scope.known_competitors),
            }
          : null,
        pestel_insights: asArray(inputs.pestel_insights),
        meetings: asArray(inputs.meetings),
        documents: asArray(inputs.documents),
      },
    },
  };
}

async function loadForEdit(tenantId: string, versionId: string) {
  const loaded = await loadVrioWorkbenchAction(tenantId);
  if (!loaded.ok) return { error: loaded.error } as const;
  if (!loaded.data) return { error: "Workbench laden mislukt" } as const;
  if (loaded.data.version.id !== versionId) {
    return { error: "Versie komt niet overeen; herlaad de pagina" } as const;
  }
  if (loaded.data.version.status === "approved") {
    return { error: "Goedgekeurde versie is alleen-lezen; maak een nieuwe conceptversie" } as const;
  }
  return { wb: loaded.data } as const;
}

type ResolvedRefs =
  | { error: string; refs?: undefined }
  | { error?: undefined; refs: { ref_type: string; ref_id: string | null; label: string; excerpt: string }[] };

function resolveRefs(wb: VrioWorkbench, refKeys: readonly string[]): ResolvedRefs {
  const catalog = buildVrioCatalog(wb.inputs);
  const byKey = new Map(catalog.map((e) => [e.key, e]));
  const refs: { ref_type: string; ref_id: string | null; label: string; excerpt: string }[] = [];
  for (const key of new Set(refKeys)) {
    const entry = byKey.get(key);
    if (!entry) return { error: "Ongeldige bronverwijzing: bron bestaat niet (meer)" } as const;
    refs.push({
      ref_type: entry.ref_type,
      ref_id: entry.ref_id,
      label: entry.label,
      excerpt: entry.text.slice(0, 600),
    });
  }
  return { refs } as const;
}

export async function saveVrioResourceAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ resourceId: string }>> {
  const parsed = vrioResourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;

  const ctx = await loadForEdit(tenantId, d.versionId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Laden mislukt" };

  const resolved = resolveRefs(ctx.wb, d.refKeys ?? []);
  if (resolved.error !== undefined) return { ok: false, error: resolved.error };

  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("upsert_vrio_resource", {
    p_version_id: d.versionId,
    p_resource_id: d.resourceId,
    p_title: d.title,
    p_description: d.description,
    p_kind: d.kind,
    p_evidence_level: d.evidenceLevel,
    p_origin: d.origin ?? "manual",
    p_swot_item_id: d.swotItemId ?? null,
    p_partner_owned: d.partnerOwned ?? false,
    p_access_note: d.accessNote ?? "",
    p_market_context: d.marketContext ?? "",
    p_refs: resolved.refs,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true, data: { resourceId: data as string } };
}

export async function setVrioResourceSelectionAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioSelectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vrio_resource_selection", {
    p_resource_id: parsed.data.resourceId,
    p_selected: parsed.data.selected,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function deleteVrioResourceAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioResourceIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("delete_vrio_resource", {
    p_resource_id: parsed.data.resourceId,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function mergeVrioResourcesAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioMergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("merge_vrio_resources", {
    p_target_id: parsed.data.targetId,
    p_source_ids: parsed.data.sourceIds,
    p_title: parsed.data.title,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function splitVrioResourceAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioSplitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("split_vrio_resource", {
    p_resource_id: parsed.data.resourceId,
    p_parts: parsed.data.parts,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function saveVrioAssessmentAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioAssessmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;

  const ctx = await loadForEdit(tenantId, d.versionId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Laden mislukt" };

  const resolved = resolveRefs(ctx.wb, d.refKeys);
  if (resolved.error !== undefined) return { ok: false, error: resolved.error };

  if (d.confirm && (d.answer === "yes" || d.answer === "no") && resolved.refs.length === 0) {
    return {
      ok: false,
      error: "Koppel minstens één bron die dit antwoord ondersteunt, of kies 'Onbekend'.",
    };
  }

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vrio_assessment", {
    p_assessment_id: d.assessmentId,
    p_answer: d.answer,
    p_motivation: d.motivation,
    p_evidence_level: d.evidenceLevel,
    p_advisor_note: d.advisorNote,
    p_open_question: d.openQuestion,
    p_skipped_reason: d.skippedReason,
    p_refs: resolved.refs,
    p_confirm: d.confirm,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function updateVrioQuestionAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioQuestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("update_vrio_question", {
    p_assessment_id: parsed.data.assessmentId,
    p_status: parsed.data.status,
    p_answer: parsed.data.answer,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function setVrioResourceReviewAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioResourceReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vrio_resource_review", {
    p_resource_id: parsed.data.resourceId,
    p_reviewed: parsed.data.reviewed,
    p_revision_note: parsed.data.revisionNote,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function resolveVrioAiProposalAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioAiProposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("resolve_vrio_ai_proposal", {
    p_assessment_id: parsed.data.assessmentId,
    p_accept: parsed.data.accept,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function prepareVrioWithAiAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ resources: number; unknowns: number }>> {
  const parsed = vrioPrepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const ctx = await loadForEdit(tenantId, parsed.data.versionId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Laden mislukt" };
  const wb = ctx.wb;

  const wanted = parsed.data.resourceIds?.length ? new Set(parsed.data.resourceIds) : null;
  const resources = wb.resources.filter(
    (r) => r.selected && (!wanted || wanted.has(r.id)),
  );
  if (resources.length === 0) {
    return { ok: false, error: "Selecteer eerst minstens één middel om te toetsen" };
  }

  const catalog = buildVrioCatalog(wb.inputs);
  let proposals;
  try {
    proposals = await prepareVrioWithAi({
      tenantName: wb.inputs.tenant.name,
      catalog,
      resources: resources.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        kind: r.kind,
        market_context: r.market_context,
      })),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI-voorbereiding mislukt" };
  }

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vrio_ai_result", {
    p_version_id: parsed.data.versionId,
    p_resources: proposals,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  const unknowns = proposals.reduce(
    (n, r) => n + r.criteria.filter((c) => c.answer === "unknown").length,
    0,
  );
  return { ok: true, data: { resources: proposals.length, unknowns } };
}

export async function saveVrioSynthesisAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioSynthesisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("update_vrio_synthesis", {
    p_version_id: parsed.data.versionId,
    p_synthesis_text: parsed.data.synthesisText,
    p_priorities: parsed.data.priorities ?? null,
    p_reviewed: parsed.data.reviewed,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function adoptVrioUpstreamAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("adopt_vrio_upstream", {
    p_version_id: parsed.data.versionId,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function createVrioRevisionAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("create_vrio_revision", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}

export async function approveVrioVersionAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = vrioApproveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("approve_vrio_version", {
    p_version_id: parsed.data.versionId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return { ok: false, error: error.message };

  revalidateVrio(tenantId);
  return { ok: true };
}
