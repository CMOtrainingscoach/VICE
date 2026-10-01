"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import {
  FIVE_C_KEYS,
  MARKETING_5C_ROUTE,
  SWOT_ROUTE,
  type FiveCKey,
} from "@/lib/marketing-5c/constants";
import { composeFiveCWithAi } from "@/lib/marketing-5c/five-c-synthesis-ai";
import {
  activeCatalog,
  buildFiveCCatalogFromWorkbench,
  isEntryAllowedForC,
} from "@/lib/marketing-5c/input-catalog";
import type { FiveCWorkbench } from "@/lib/marketing-5c/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import {
  fiveCApproveSchema,
  fiveCComposeSchema,
  fiveCContradictionSchema,
  fiveCExcludedInputsSchema,
  fiveCGapSchema,
  fiveCItemReviewSchema,
  fiveCItemSchema,
  fiveCSectionReviewSchema,
  fiveCSynthesisSchema,
  fiveCUpstreamRequestSchema,
  fiveCVersionSchema,
} from "@/modules/marketing-5c/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateFiveC(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${MARKETING_5C_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`);
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

export async function loadFiveCWorkbenchAction(
  tenantId: string,
): Promise<ActionResult<FiveCWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_five_c_workbench", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: error.message };

  const raw = data as Record<string, unknown> & {
    version: FiveCWorkbench["version"];
    upstream: FiveCWorkbench["upstream"];
    inputs: FiveCWorkbench["inputs"];
  };
  const inputs = raw.inputs;
  return {
    ok: true,
    data: {
      version: {
        ...raw.version,
        excluded_inputs: asArray<string>(raw.version.excluded_inputs),
        coherence_points: asArray(raw.version.coherence_points),
      },
      upstream: raw.upstream,
      sections: asArray(raw.sections),
      items: asArray<FiveCWorkbench["items"][number]>(raw.items).map((i) => ({
        ...i,
        refs: asArray(i.refs),
      })),
      contradictions: asArray(raw.contradictions),
      upstreamRequests: asArray(raw.upstream_requests),
      inputs: {
        tenant: inputs.tenant,
        meetings: asArray(inputs.meetings),
        pestel_inputs: asArray(inputs.pestel_inputs),
        pestel_insights: asArray(inputs.pestel_insights),
        pestel_scope:
          inputs.pestel_scope ?
            { ...inputs.pestel_scope, geo_markets: asArray(inputs.pestel_scope.geo_markets) }
          : null,
        porter_scope:
          inputs.porter_scope ?
            {
              ...inputs.porter_scope,
              geo_markets: asArray(inputs.porter_scope.geo_markets),
              known_competitors: asArray(inputs.porter_scope.known_competitors),
            }
          : null,
        porter_forces: asArray(inputs.porter_forces),
        porter_factors: asArray(inputs.porter_factors),
      },
    },
  };
}

async function loadForVersion(tenantId: string, versionId: string) {
  const loaded = await loadFiveCWorkbenchAction(tenantId);
  if (!loaded.ok) return { error: loaded.error } as const;
  if (!loaded.data) return { error: "Workbench laden mislukt" } as const;
  if (loaded.data.version.id !== versionId) return { error: "Versie komt niet overeen; herlaad de pagina" } as const;
  if (loaded.data.version.status === "approved") {
    return { error: "Goedgekeurde versie is alleen-lezen; maak een nieuwe conceptversie" } as const;
  }
  return { wb: loaded.data } as const;
}

export async function saveFiveCItemAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ itemId: string }>> {
  const parsed = fiveCItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;

  const ctx = await loadForVersion(tenantId, d.versionId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Laden mislukt" };

  const catalog = buildFiveCCatalogFromWorkbench(ctx.wb);
  const byKey = new Map(catalog.map((e) => [e.key, e]));
  const refs = [];
  for (const key of new Set(d.refKeys)) {
    const entry = byKey.get(key);
    if (!entry) return { ok: false, error: "Ongeldige bronverwijzing: bron bestaat niet (meer)" };
    if (entry.ref_type === "manual" && entry.ref_id === d.itemId) continue;
    if (!isEntryAllowedForC(entry, d.cKey)) {
      return { ok: false, error: `Bron "${entry.label}" hoort niet bij dit onderdeel` };
    }
    refs.push({
      ref_type: entry.ref_type,
      ref_id: entry.ref_id,
      label: entry.label,
      excerpt: entry.text.slice(0, 600),
    });
  }

  if (d.contentType !== "input_needed" && refs.length === 0 && !d.advisorNote.trim() && !d.finding.trim()) {
    return { ok: false, error: "Vul een bevinding in of koppel een bron" };
  }
  if (d.contentType === "input_needed" && d.openQuestion.trim().length < 5) {
    return { ok: false, error: "Formuleer de open vraag voor dit hiaat" };
  }

  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("upsert_five_c_item", {
    p_version_id: d.versionId,
    p_item_id: d.itemId,
    p_c_key: d.cKey,
    p_title: d.title,
    p_finding: d.finding,
    p_client_relevance: d.clientRelevance,
    p_content_type: d.contentType,
    p_evidence_level: d.evidenceLevel,
    p_qualifier: d.qualifier,
    p_advisor_note: d.advisorNote,
    p_open_question: d.openQuestion,
    p_gap_reason: d.gapReason,
    p_refs: refs,
    p_mark_reviewed: d.markReviewed,
  });
  if (error) return { ok: false, error: error.message };

  revalidateFiveC(tenantId);
  return { ok: true, data: { itemId: data as string } };
}

export async function setFiveCItemReviewAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCItemReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_five_c_item_review", {
    p_item_id: parsed.data.itemId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function updateFiveCGapAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCGapSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("update_five_c_gap", {
    p_item_id: parsed.data.itemId,
    p_gap_status: parsed.data.gapStatus,
    p_gap_answer: parsed.data.gapAnswer,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function setFiveCSectionReviewAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCSectionReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_five_c_section_review", {
    p_section_id: parsed.data.sectionId,
    p_reviewed: parsed.data.reviewed,
    p_gaps_accepted: parsed.data.gapsAccepted,
    p_gaps_note: parsed.data.gapsNote,
    p_summary: parsed.data.summary,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function saveFiveCSynthesisAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCSynthesisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("update_five_c_synthesis", {
    p_version_id: parsed.data.versionId,
    p_synthesis_text: parsed.data.synthesisText,
    p_reviewed: parsed.data.reviewed,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function setFiveCExcludedInputsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCExcludedInputsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_five_c_excluded_inputs", {
    p_version_id: parsed.data.versionId,
    p_keys: [...new Set(parsed.data.keys)],
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function resolveFiveCContradictionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCContradictionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("resolve_five_c_contradiction", {
    p_contradiction_id: parsed.data.contradictionId,
    p_resolution: parsed.data.resolution,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function addFiveCUpstreamRequestAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCUpstreamRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("add_five_c_upstream_request", {
    p_version_id: parsed.data.versionId,
    p_target: parsed.data.target,
    p_c_key: parsed.data.cKey,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function composeFiveCAnalysisAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ flagged: number; items: number }>> {
  const parsed = fiveCComposeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const ctx = await loadForVersion(tenantId, parsed.data.versionId);
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "Laden mislukt" };
  const wb = ctx.wb;

  const cKeys: FiveCKey[] = parsed.data.cKeys?.length ? [...new Set(parsed.data.cKeys)] : [...FIVE_C_KEYS];
  const catalog = activeCatalog(buildFiveCCatalogFromWorkbench(wb), wb.version.excluded_inputs);

  const keptTitles: Partial<Record<FiveCKey, string[]>> = {};
  for (const item of wb.items) {
    if (item.review_status === "rejected") continue;
    if (item.origin === "manual" || item.review_status === "reviewed") {
      (keptTitles[item.c_key] ??= []).push(item.title);
    }
  }

  let result;
  try {
    result = await composeFiveCWithAi({
      tenantName: wb.inputs.tenant.name,
      catalog,
      cKeys,
      includeCrossCutting: cKeys.length === FIVE_C_KEYS.length,
      keptTitles,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "5C-analyse mislukt" };
  }

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_five_c_ai_result", {
    p_version_id: wb.version.id,
    p_c_keys: cKeys,
    p_sections: result.sections,
    p_contradictions: result.contradictions,
    p_coherence: cKeys.length === FIVE_C_KEYS.length ? result.coherence : null,
  });
  if (error) return { ok: false, error: error.message };

  revalidateFiveC(tenantId);
  const items = Object.values(result.sections).reduce((n, s) => n + (s?.items.length ?? 0), 0);
  return { ok: true, data: { flagged: result.rejectedRefCount, items } };
}

export async function adoptFiveCUpstreamAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("adopt_five_c_upstream", {
    p_version_id: parsed.data.versionId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function createFiveCRevisionAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("create_five_c_revision", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}

export async function approveFiveCVersionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = fiveCApproveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("approve_five_c_version", {
    p_version_id: parsed.data.versionId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return { ok: false, error: error.message };
  revalidateFiveC(tenantId);
  return { ok: true };
}
