"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import { createClient } from "@/lib/supabase/server";
import { buildStpCatalog } from "@/lib/stp/catalog";
import { STP_ROUTE } from "@/lib/stp/constants";
import { proposeStpIcp, proposeStpPosition, proposeStpSegments, proposeStpSentence, proposeStpTarget } from "@/lib/stp/stp-ai";
import type { StpCriterion, StpPublished, StpScore, StpSegment, StpWorkbench } from "@/lib/stp/types";
import { VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import {
  stpAiSchema,
  stpApplySchema,
  stpDispositionSchema,
  stpExpectedSchema,
  stpIcpSchema,
  stpMergeSchema,
  stpPositionSchema,
  stpResolveSchema,
  stpScopeSchema,
  stpScoresSchema,
  stpSegmentIdSchema,
  stpSegmentSchema,
  stpStepSchema,
  stpTargetSchema,
  stpVersionSchema,
} from "@/modules/stp/schema";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function revalidateStp(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${STP_ROUTE}`);
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

function mapWorkbench(raw: Record<string, unknown>): StpWorkbench {
  return {
    version: raw.version as StpWorkbench["version"],
    segments: asArray<StpSegment>(raw.segments).map((segment) => ({
      ...segment,
      scores: asArray<StpScore>(segment.scores),
      refs: asArray(segment.refs),
      ai_payload: segment.ai_payload && typeof segment.ai_payload === "object" ? segment.ai_payload : {},
    })),
    criteria: asArray<StpCriterion>(raw.criteria),
    inputs: raw.inputs as StpWorkbench["inputs"],
  };
}

export async function loadStpWorkbenchAction(tenantId: string, versionId?: string): Promise<ActionResult<StpWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_stp_workbench", {
    p_tenant_id: tenantId,
    p_version_id: versionId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "Workbench gaf geen data terug." };
  return { ok: true, data: mapWorkbench(data as Record<string, unknown>) };
}

async function call(tenantId: string, fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  revalidateStp(tenantId);
  return { ok: true };
}

export async function saveStpScopeAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpScopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "save_stp_scope", {
    p_version_id: parsed.data.versionId,
    p_offering: parsed.data.offering,
    p_geography: parsed.data.geography,
    p_note: parsed.data.note,
    p_confirm: parsed.data.confirm,
  });
}

export async function setStpStepAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "set_stp_step", { p_version_id: parsed.data.versionId, p_step: parsed.data.step });
}

export async function saveStpSegmentAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpSegmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "upsert_stp_segment", {
    p_version_id: d.versionId,
    p_segment_id: d.segmentId,
    p_payload: {
      name: d.name,
      description: d.description,
      need: d.need,
      traits: d.traits,
      geography: d.geography,
      trigger_text: d.triggerText,
      offering: d.offering,
      include_criteria: d.includeCriteria,
      exclude_criteria: d.excludeCriteria,
      assumptions: d.assumptions,
      open_question: d.openQuestion,
      hypothesis: d.hypothesis,
      refs: d.refs,
    },
  });
}

export async function archiveStpSegmentAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpSegmentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "archive_stp_segment", { p_segment_id: parsed.data.segmentId });
}

export async function mergeStpSegmentsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpMergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "merge_stp_segments", { p_keep_id: parsed.data.keepId, p_drop_id: parsed.data.dropId });
}

export async function setStpDispositionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpDispositionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "set_stp_disposition", {
    p_segment_id: parsed.data.segmentId,
    p_disposition: parsed.data.disposition,
    p_reason: parsed.data.reason,
  });
}

export async function saveStpScoresAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpScoresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "save_stp_scores", { p_segment_id: parsed.data.segmentId, p_scores: parsed.data.scores });
}

export async function confirmStpSegmentsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "confirm_stp_segments", { p_version_id: parsed.data.versionId });
}

export async function confirmStpTargetAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "confirm_stp_target", { p_version_id: parsed.data.versionId, p_motivation: parsed.data.motivation });
}

export async function saveStpPositionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpPositionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "save_stp_position", {
    p_version_id: d.versionId,
    p_payload: {
      audience: d.audience,
      problem: d.problem,
      promise: d.promise,
      distinction: d.distinction,
      evidence_text: d.evidenceText,
      position_sentence: d.sentence,
      claim_status: d.claimStatus,
    },
  });
}

export async function confirmStpPositionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "confirm_stp_position", { p_version_id: parsed.data.versionId });
}

export async function saveStpIcpAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpIcpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "save_stp_icp", {
    p_version_id: d.versionId,
    p_payload: {
      icp_name: d.icpName,
      icp_summary: d.icpSummary,
      icp_sector: d.icpSector,
      icp_stage: d.icpStage,
      icp_size: d.icpSize,
      icp_structure: d.icpStructure,
      icp_tech: d.icpTech,
      icp_problem: d.icpProblem,
      icp_need: d.icpNeed,
      icp_outcome: d.icpOutcome,
      icp_trigger: d.icpTrigger,
      icp_inaction: d.icpInaction,
      icp_budget: d.icpBudget,
      icp_capacity: d.icpCapacity,
      icp_conditions: d.icpConditions,
      icp_timing: d.icpTiming,
      assumptions: d.assumptions,
      open_questions: d.openQuestions,
      accepted_uncertainty: d.acceptedUncertainty,
      criteria: d.criteria,
    },
  });
}

async function generate(tenantId: string, input: unknown, kind: "segments" | "target" | "position" | "icp"): Promise<ActionResult> {
  const parsed = stpAiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadStpWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const wb = loaded.data;
  if (wb.version.updated_at !== parsed.data.expectedUpdatedAt) {
    return { ok: false, error: "De analyse is gewijzigd tijdens het voorbereiden. Genereer opnieuw." };
  }
  const sources = buildStpCatalog(wb.inputs);
  const active = wb.segments.filter((segment) => !segment.archived_at);
  const primary = active.find((segment) => segment.disposition === "primary");
  try {
    let payload: Record<string, unknown> = {};
    let applyNew = false;
    if (kind === "segments") {
      const proposed = await proposeStpSegments({ tenantName: wb.inputs.tenant.name, offering: wb.version.offering, geography: wb.version.geography, sources });
      if (proposed.segments.length === 0) {
        return { ok: false, error: "De bronnen dragen nog geen onderscheidbaar segment. Voeg er zelf een toe. Bestaande tekst blijft staan." };
      }
      const used = new Set<string>();
      payload = {
        segments: proposed.segments.map((row) => {
          const name = String(row.name ?? "").trim().toLowerCase();
          const match = active.find((segment) => !used.has(segment.id) && segment.name.trim().toLowerCase() === name);
          if (!match) return row;
          used.add(match.id);
          return { ...row, segment_id: match.id };
        }),
      };
      applyNew = active.length === 0;
    }
    if (kind === "target") payload = await proposeStpTarget({ tenantName: wb.inputs.tenant.name, segments: active.map((segment) => ({ name: segment.name, need: segment.need })), sources });
    if (kind === "position") {
      payload = await proposeStpPosition({
        tenantName: wb.inputs.tenant.name,
        offering: wb.version.offering,
        segmentName: primary?.name ?? "nog geen doelgroep",
        need: primary?.need ?? "",
        sources,
      });
    }
    if (kind === "icp") {
      payload = await proposeStpIcp({
        tenantName: wb.inputs.tenant.name,
        offering: wb.version.offering,
        segmentName: primary?.name ?? "",
        need: primary?.need ?? "",
        position: {
          audience: wb.version.audience,
          problem: wb.version.problem,
          promise: wb.version.promise,
          distinction: wb.version.distinction,
          evidence_text: wb.version.evidence_text,
          sentence: wb.version.position_sentence,
        },
        sources,
      });
    }
    const saved = await call(tenantId, "save_stp_ai_result", {
      p_version_id: parsed.data.versionId,
      p_expected: parsed.data.expectedUpdatedAt,
      p_kind: kind,
      p_payload: payload,
      p_apply_new: applyNew,
    });
    return saved;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI-voorstel mislukt. Je tekst blijft staan." };
  }
}

export async function proposeStpSegmentsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  return generate(tenantId, input, "segments");
}
export async function proposeStpTargetAction(tenantId: string, input: unknown): Promise<ActionResult> {
  return generate(tenantId, input, "target");
}
export async function proposeStpPositionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  return generate(tenantId, input, "position");
}

export async function composeStpSentenceAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpAiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadStpWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const wb = loaded.data;
  if (wb.version.updated_at !== parsed.data.expectedUpdatedAt) {
    return { ok: false, error: "De analyse is gewijzigd tijdens het voorbereiden. Maak de zin opnieuw." };
  }
  const active = wb.segments.filter((segment) => !segment.archived_at);
  const primary = active.find((segment) => segment.disposition === "primary");
  try {
    const sentence = await proposeStpSentence({
      tenantName: wb.inputs.tenant.name,
      offering: wb.version.offering,
      geography: wb.version.geography,
      segmentName: primary?.name ?? "",
      need: primary?.need ?? "",
      audience: wb.version.audience,
      problem: wb.version.problem,
      promise: wb.version.promise,
      distinction: wb.version.distinction,
      evidence: wb.version.evidence_text,
      sources: buildStpCatalog(wb.inputs),
    });
    if (sentence.length < 12) {
      return { ok: false, error: "De beschikbare gegevens dragen nog geen positioneringszin. Het veld blijft zoals het was." };
    }
    const again = await loadStpWorkbenchAction(tenantId, parsed.data.versionId);
    if (!again.ok || !again.data) return { ok: false, error: again.ok ? "Herladen mislukt" : again.error };
    if (again.data.version.updated_at !== wb.version.updated_at) {
      return { ok: false, error: "De pagina is intussen gewijzigd. De zin is niet geplaatst. Maak hem opnieuw." };
    }
    const current = again.data.version;
    return call(tenantId, "save_stp_position", {
      p_version_id: current.id,
      p_payload: {
        audience: current.audience,
        problem: current.problem,
        promise: current.promise,
        distinction: current.distinction,
        evidence_text: current.evidence_text,
        position_sentence: sentence,
        claim_status: current.claim_status,
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "De zin kon niet gemaakt worden. Je tekst blijft staan." };
  }
}
export async function proposeStpIcpAction(tenantId: string, input: unknown): Promise<ActionResult> {
  return generate(tenantId, input, "icp");
}

export async function applyStpProposalAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpApplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "apply_stp_proposal", { p_version_id: parsed.data.versionId, p_kind: parsed.data.kind });
}

export async function resolveStpProposalAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpResolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "resolve_stp_proposal", { p_segment_id: parsed.data.segmentId, p_accept: parsed.data.accept });
}

export async function approveStpAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpExpectedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "approve_stp_version", { p_version_id: parsed.data.versionId, p_expected: parsed.data.expectedUpdatedAt });
}

export async function createStpRevisionAction(tenantId: string, input: unknown): Promise<ActionResult<{ versionId: string }>> {
  const parsed = stpVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("create_stp_revision", { p_version_id: parsed.data.versionId });
  if (error) return { ok: false, error: error.message };
  revalidateStp(tenantId);
  return { ok: true, data: { versionId: String(data) } };
}

export async function publishStpAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "publish_stp_version", { p_version_id: parsed.data.versionId });
}

export async function unpublishStpAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = stpVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "unpublish_stp_version", { p_version_id: parsed.data.versionId });
}

export async function exportStpTextAction(tenantId: string, input: unknown): Promise<ActionResult<{ text: string }>> {
  const parsed = stpVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadStpWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const wb = loaded.data;
  const primary = wb.segments.find((segment) => segment.id === wb.version.primary_segment_id);
  const lines = [
    wb.version.status === "approved" ? "Goedgekeurd ICP" : "Concept-ICP",
    `Versie ${wb.version.version_number}`,
    wb.inputs.tenant.name,
    wb.version.icp_name || "Naam nog leeg",
    wb.version.icp_summary,
    `Aanbod: ${wb.version.offering || "onbekend"}`,
    `Doelgroep: ${primary?.name || "nog niet gekozen"}`,
    `Positionering: ${wb.version.position_sentence || wb.version.promise || "nog leeg"}`,
    "",
    "Moet aanwezig zijn:",
    ...wb.criteria.filter((item) => item.kind === "must").map((item) => `- ${item.body}`),
    "Pluspunten:",
    ...wb.criteria.filter((item) => item.kind === "plus").map((item) => `- ${item.body}`),
    "Past niet:",
    ...wb.criteria.filter((item) => item.kind === "exclude").map((item) => `- ${item.body}`),
    "",
    wb.version.open_questions ? `Open vragen: ${wb.version.open_questions}` : "Open vragen: geen",
    wb.version.accepted_uncertainty ? `Aanvaarde onzekerheid: ${wb.version.accepted_uncertainty}` : "",
    wb.version.icp_budget ? `Budget: ${wb.version.icp_budget}` : "Budget: onbekend",
  ].filter((line) => line !== undefined);
  const supabase = await authed();
  const logged = await supabase.schema("app").rpc("log_stp_export", { p_version_id: parsed.data.versionId });
  if (logged.error) return { ok: false, error: logged.error.message };
  return { ok: true, data: { text: lines.join("\n") } };
}

export async function loadStpPublishedAction(tenantId: string): Promise<StpPublished | null> {
  const session = await requireSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_stp_published", { p_tenant_id: tenantId });
  if (error || !data || typeof data !== "object") return null;
  return data as StpPublished;
}
