"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { buildBcgCatalog } from "@/lib/bcg/input-catalog";
import { composeBcgSynthesis, prepareBcgWithAi } from "@/lib/bcg/bcg-ai";
import { BCG_QUADRANT_META, BCG_ROUTE } from "@/lib/bcg/constants";
import { canonicalBcgNumber } from "@/lib/bcg/math";
import { readingFor } from "@/lib/bcg/reading";
import type { BcgAiPayload, BcgInputs, BcgItem, BcgRef, BcgWorkbench } from "@/lib/bcg/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import { VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import { VRIO_ROUTE } from "@/lib/vrio/constants";
import {
  bcgAddItemSchema,
  bcgDeleteItemSchema,
  bcgItemSchema,
  bcgOverlapSchema,
  bcgPrepareSchema,
  bcgPublishSchema,
  bcgQualitativeSchema,
  bcgResolveSchema,
  bcgReviewSchema,
  bcgScopeCreateSchema,
  bcgScopeSchema,
  bcgSelectionSchema,
  bcgSplitSchema,
  bcgSynthesisSchema,
  bcgThresholdSchema,
  bcgVersionSchema,
} from "@/modules/bcg/schema";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function revalidateBcg(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${BCG_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
  revalidatePath(`/klanten/${tenantId}`);
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function num(value: unknown): string | null {
  if (value == null || value === "") return null;
  return canonicalBcgNumber(String(value)) ?? String(value);
}

function itemOf(raw: BcgItem): BcgItem {
  const payload = raw.ai_payload && typeof raw.ai_payload === "object" ? raw.ai_payload : {};
  return {
    ...raw,
    growth_percent: num(raw.growth_percent),
    size_previous: num(raw.size_previous),
    size_current: num(raw.size_current),
    own_share: num(raw.own_share),
    leader_share: num(raw.leader_share),
    own_amount: num(raw.own_amount),
    leader_amount: num(raw.leader_amount),
    refs: asArray<BcgRef>(raw.refs),
    ai_payload: payload as BcgAiPayload,
  };
}

export async function loadBcgWorkbenchAction(tenantId: string, versionId?: string | null): Promise<ActionResult<BcgWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_bcg_workbench", {
    p_tenant_id: tenantId,
    p_version_id: versionId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const raw = data as BcgWorkbench;
  const inputs = raw.inputs ?? ({} as BcgInputs);
  const scope = inputs.porter_scope;
  return {
    ok: true,
    data: {
      version: {
        ...raw.version,
        growth_threshold: num(raw.version?.growth_threshold),
        share_threshold: num(raw.version?.share_threshold) ?? "1",
        ai_questions: asArray<string>(raw.version?.ai_questions),
      },
      upstream: raw.upstream,
      items: asArray<BcgItem>(raw.items).map(itemOf),
      scopes: asArray(raw.scopes),
      history: asArray(raw.history),
      inputs: {
        tenant: inputs.tenant,
        swot_items: asArray(inputs.swot_items),
        five_c_items: asArray(inputs.five_c_items),
        five_c_synthesis: inputs.five_c_synthesis ?? null,
        porter_forces: asArray(inputs.porter_forces),
        porter_scope: scope ? { ...scope, known_competitors: asArray(scope.known_competitors) } : null,
        pestel_insights: asArray(inputs.pestel_insights),
        vrio_resources: asArray(inputs.vrio_resources),
        meetings: asArray(inputs.meetings),
        documents: asArray(inputs.documents),
      },
    },
  };
}

async function loadForEdit(
  tenantId: string,
  versionId: string,
): Promise<{ error: string; wb?: undefined } | { error?: undefined; wb: BcgWorkbench }> {
  const loaded = await loadBcgWorkbenchAction(tenantId, versionId);
  if (!loaded.ok || !loaded.data) return { error: !loaded.ok ? loaded.error : "Geen data" };
  if (loaded.data.version.id !== versionId) return { error: "Verkeerde analyseversie" };
  if (loaded.data.version.status === "approved") return { error: "Goedgekeurde BCG-versie is alleen-lezen" };
  return { wb: loaded.data };
}

export async function saveBcgScopeAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgScopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_bcg_scope", {
    p_version_id: parsed.data.versionId,
    p_scope_label: parsed.data.scopeLabel,
    p_market: parsed.data.market,
    p_geography: parsed.data.geography,
    p_segment: parsed.data.segment,
    p_period: parsed.data.period,
    p_period_kind: parsed.data.periodKind,
    p_basis: parsed.data.basis,
    p_currency: parsed.data.currency,
    p_unit: parsed.data.unit,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function saveBcgThresholdsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgThresholdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_bcg_thresholds", {
    p_version_id: parsed.data.versionId,
    p_growth: canonicalBcgNumber(parsed.data.growth) ?? "",
    p_note: parsed.data.note,
    p_source: parsed.data.source,
    p_share: canonicalBcgNumber(parsed.data.share) ?? "",
    p_confirm: parsed.data.confirm,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function setBcgQualitativeAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgQualitativeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_bcg_qualitative", {
    p_version_id: parsed.data.versionId,
    p_on: parsed.data.on,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function saveBcgItemAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("upsert_bcg_item", {
    p_version_id: d.versionId,
    p_item_id: d.itemId,
    p_expected_updated_at: d.expectedUpdatedAt,
    p_payload: {
      title: d.title,
      description: d.description,
      kind: d.kind,
      origin: "manual",
      market_definition: d.marketDefinition,
      geography: d.geography,
      segment: d.segment,
      period_label: d.periodLabel,
      period_kind: d.periodKind,
      measure_basis: d.measureBasis,
      currency: d.currency,
      unit_label: d.unitLabel,
      scope_confirmed: d.scopeConfirmed,
      growth_method: d.growthMethod,
      growth_percent: canonicalBcgNumber(d.growthPercent) ?? "",
      size_previous: canonicalBcgNumber(d.sizePrevious) ?? "",
      size_current: canonicalBcgNumber(d.sizeCurrent) ?? "",
      size_scale: d.sizeScale,
      growth_evidence: d.growthEvidence,
      share_method: d.shareMethod,
      own_share: canonicalBcgNumber(d.ownShare) ?? "",
      leader_share: canonicalBcgNumber(d.leaderShare) ?? "",
      own_amount: canonicalBcgNumber(d.ownAmount) ?? "",
      leader_amount: canonicalBcgNumber(d.leaderAmount) ?? "",
      amount_scale: d.amountScale,
      client_is_leader: d.clientIsLeader,
      leader_name: d.leaderName,
      share_evidence: d.shareEvidence,
      figures_conflict: d.figuresConflict,
      conflict_accepted: d.conflictAccepted,
      figures_confirmed: d.figuresConfirmed,
      advisor_note: d.advisorNote,
      open_question: d.openQuestion,
      question_status: d.questionStatus,
      gap_reason: d.gapReason,
      refs: d.refs,
    },
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function setBcgSelectionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgSelectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_bcg_selection", {
    p_item_id: parsed.data.itemId,
    p_selected: parsed.data.selected,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function setBcgOverlapAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgOverlapSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_bcg_overlap", {
    p_item_id: parsed.data.itemId,
    p_mode: parsed.data.mode,
    p_key: parsed.data.key,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function splitBcgItemAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgSplitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("split_bcg_item", {
    p_item_id: parsed.data.itemId,
    p_titles: parsed.data.titles,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function setBcgReviewAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_bcg_review", {
    p_item_id: parsed.data.itemId,
    p_reviewed: parsed.data.reviewed,
    p_gap: parsed.data.gap,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function adoptBcgOfferingsAction(tenantId: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = bcgVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("adopt_bcg_offerings", { p_version_id: parsed.data.versionId });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true, data: { count: Number(data ?? 0) } };
}

export async function addBcgItemAction(tenantId: string, input: unknown): Promise<ActionResult<{ itemId: string }>> {
  const parsed = bcgAddItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("add_bcg_item", {
    p_version_id: parsed.data.versionId,
    p_title: parsed.data.title,
    p_kind: parsed.data.kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true, data: { itemId: String(data) } };
}

export async function deleteBcgItemAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgDeleteItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("delete_bcg_item", { p_item_id: parsed.data.itemId });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function prepareBcgAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgPrepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  if (!parsed.data.itemId) {
    const supabase = await authed();
    const adopted = await supabase.schema("app").rpc("adopt_bcg_offerings", { p_version_id: parsed.data.versionId });
    if (adopted.error && !/5C/i.test(adopted.error.message)) return { ok: false, error: adopted.error.message };
  }
  const ctx = await loadForEdit(tenantId, parsed.data.versionId);
  if (ctx.error || !ctx.wb) return { ok: false, error: ctx.error ?? "Geen data" };
  const selected = ctx.wb.items.filter((item) => !parsed.data.itemId || item.id === parsed.data.itemId);
  if (selected.length === 0) {
    return { ok: false, error: "Er is nog geen aanbod. Voeg een portfolio-item toe of rond de 5C af. De AI verzint geen aanbod." };
  }
  try {
    const prepared = await prepareBcgWithAi({
      tenantName: ctx.wb.inputs.tenant.name,
      catalog: buildBcgCatalog(ctx.wb.inputs),
      onlyItemId: parsed.data.itemId,
      items: selected.map((item) => ({
        id: item.id,
        title: item.title,
        market: item.market_definition,
        locked: item.manual_lock || item.figures_confirmed,
      })),
    });
    const supabase = await authed();
    const { error } = await supabase.schema("app").rpc("save_bcg_ai_result", {
      p_version_id: parsed.data.versionId,
      p_payload: prepared,
      p_model: process.env.VICE_BCG_MODEL?.trim() || "gpt-4o",
    });
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI-voorbereiding mislukt" };
  }
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function resolveBcgAiAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgResolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("resolve_bcg_ai_proposal", {
    p_item_id: parsed.data.itemId,
    p_accept: parsed.data.accept,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function saveBcgSynthesisAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgSynthesisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_bcg_synthesis", {
    p_version_id: parsed.data.versionId,
    p_text: parsed.data.text,
    p_reviewed: parsed.data.reviewed,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function generateBcgSynthesisAction(tenantId: string, input: unknown): Promise<ActionResult<{ text: string }>> {
  const parsed = bcgVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const ctx = await loadForEdit(tenantId, parsed.data.versionId);
  if (ctx.error || !ctx.wb) return { ok: false, error: ctx.error ?? "Geen data" };
  const lines = ctx.wb.items.filter((item) => item.selected).map((item) => {
    const reading = readingFor(item, ctx.wb.version);
    const position =
      ctx.wb.version.qualitative ? "Kwalitatieve bespreking, geen kwantitatieve plaatsing."
      : reading.placeable && reading.previewQuadrant ? `${BCG_QUADRANT_META[reading.previewQuadrant].label}. ${reading.explanation}`
      : `Niet plaatsbaar. ${reading.reasons.join(" ")}`;
    return {
      title: item.title,
      market: item.market_definition || ctx.wb.version.market_label,
      position,
      note: item.advisor_note || item.open_question || item.gap_reason,
    };
  });
  try {
    const text = await composeBcgSynthesis({ tenantName: ctx.wb.inputs.tenant.name, lines });
    const supabase = await authed();
    const { error } = await supabase.schema("app").rpc("save_bcg_synthesis", {
      p_version_id: parsed.data.versionId,
      p_text: text,
      p_reviewed: false,
    });
    if (error) return { ok: false, error: error.message };
    revalidateBcg(tenantId);
    return { ok: true, data: { text } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI-synthese mislukt" };
  }
}

export async function approveBcgAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ versionId: z.string().uuid(), expectedUpdatedAt: z.string().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("approve_bcg_version", {
    p_version_id: parsed.data.versionId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function createBcgRevisionAction(tenantId: string, input: unknown): Promise<ActionResult<{ versionId: string }>> {
  const parsed = bcgVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("create_bcg_revision", { p_version_id: parsed.data.versionId });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true, data: { versionId: String(data) } };
}

export async function addBcgScopeAction(tenantId: string, input: unknown): Promise<ActionResult<{ versionId: string }>> {
  const parsed = bcgScopeCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("add_bcg_scope", {
    p_tenant_id: tenantId,
    p_label: parsed.data.label,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true, data: { versionId: String(data) } };
}

export async function publishBcgAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgPublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("publish_bcg_version", {
    p_version_id: parsed.data.versionId,
    p_publish_figures: parsed.data.publishFigures,
  });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}

export async function unpublishBcgAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = bcgVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("unpublish_bcg_version", { p_version_id: parsed.data.versionId });
  if (error) return { ok: false, error: error.message };
  revalidateBcg(tenantId);
  return { ok: true };
}
