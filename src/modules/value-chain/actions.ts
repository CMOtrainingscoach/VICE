"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import { createClient } from "@/lib/supabase/server";
import { BCG_ROUTE } from "@/lib/vrio/constants";
import { mapCsvLines, minorToAmountString, parseAmount, parseCsv } from "@/lib/value-chain/finance";
import { buildVcCatalog } from "@/lib/value-chain/input-catalog";
import { STP_ROUTE, VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import type { VcActivity, VcWorkbench } from "@/lib/value-chain/types";
import { prepareValueChainWithAi } from "@/lib/value-chain/value-chain-ai";
import {
  vcActivityIdSchema,
  vcActivitySchema,
  vcAllocationSchema,
  vcApproveSchema,
  vcActionSchema,
  vcChainSchema,
  vcCostRateSchema,
  vcDependencySchema,
  vcFinanceFlagsSchema,
  vcImportSchema,
  vcLineSchema,
  vcMergeSchema,
  vcPrepareSchema,
  vcResolveSchema,
  vcSynthesisSchema,
  vcVersionSchema,
} from "@/modules/value-chain/schema";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function revalidateVc(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${BCG_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${STP_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
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
  return String(value);
}

/** Komma is decimaal bij invoer, een punt bij een al gecanoniseerd bedrag. */
function canonicalAmount(raw: string): { minor: bigint } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Bedrag ontbreekt" };
  const mode = trimmed.includes(",") && trimmed.includes(".") ? "auto" : trimmed.includes(",") ? "comma" : "point";
  const parsed = parseAmount(trimmed, mode);
  if (parsed.formula) return { error: "Formules worden niet uitgevoerd." };
  if (parsed.minor == null || parsed.uncertain) return { error: "Dit bedrag is niet eenduidig. Laat het leeg als het onbekend is." };
  return { minor: parsed.minor };
}

function mapWorkbench(raw: Record<string, unknown>): VcWorkbench {
  const version = raw.version as VcWorkbench["version"];
  const inputs = raw.inputs as VcWorkbench["inputs"];
  return {
    finance_access: Boolean(raw.finance_access),
    version: { ...version, cost_rate: num(version.cost_rate) },
    upstream: raw.upstream as VcWorkbench["upstream"],
    chains: asArray<VcWorkbench["chains"][number]>(raw.chains).map((chain) => ({
      ...chain,
      activities: asArray<VcActivity>(chain.activities).map((activity) => ({
        ...activity,
        time_value: num(activity.time_value),
        refs: asArray(activity.refs),
        subactivities: asArray(activity.subactivities),
        dependencies: asArray(activity.dependencies),
      })),
    })),
    imports: asArray<VcWorkbench["imports"][number]>(raw.imports).map((item) => ({
      ...item,
      lines: asArray<VcWorkbench["imports"][number]["lines"][number]>(item.lines).map((line) => ({
        ...line,
        amount: num(line.amount),
      })),
    })),
    allocations: asArray<VcWorkbench["allocations"][number]>(raw.allocations).map((allocation) => ({
      ...allocation,
      amount: num(allocation.amount),
    })),
    actions: asArray(raw.actions),
    inputs: {
      ...inputs,
      swot_items: asArray(inputs.swot_items),
      five_c_items: asArray(inputs.five_c_items),
      porter_forces: asArray(inputs.porter_forces),
      pestel_insights: asArray(inputs.pestel_insights),
      meetings: asArray(inputs.meetings),
      documents: asArray(inputs.documents),
      vrio_resources: asArray(inputs.vrio_resources),
    },
  };
}

export async function loadValueChainWorkbenchAction(tenantId: string): Promise<ActionResult<VcWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_vc_workbench", { p_tenant_id: tenantId });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "Workbench gaf geen data terug." };
  return { ok: true, data: mapWorkbench(data as Record<string, unknown>) };
}

async function loadForEdit(
  tenantId: string,
  versionId: string,
): Promise<{ error: string; wb?: undefined } | { error?: undefined; wb: VcWorkbench }> {
  const loaded = await loadValueChainWorkbenchAction(tenantId);
  if (!loaded.ok) return { error: loaded.error };
  if (!loaded.data) return { error: "Workbench laden mislukt" };
  if (loaded.data.version.id !== versionId) return { error: "Versie komt niet overeen; herlaad de pagina" };
  if (loaded.data.version.status === "approved") {
    return { error: "Goedgekeurde versie is alleen-lezen; maak een nieuwe conceptversie" };
  }
  return { wb: loaded.data };
}

export async function saveVcChainAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcChainSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_chain", {
    p_chain_id: d.chainId,
    p_offering: d.offering,
    p_business_type: d.businessType,
    p_market: d.market,
    p_period: d.periodLabel,
    p_goal: d.goal,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function addVcChainAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("add_vc_chain", { p_version_id: parsed.data.versionId });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function saveVcActivityAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const ctx = await loadForEdit(tenantId, (await findVersionId(tenantId, d.chainId)) ?? "");
  if (ctx.error || !ctx.wb) return { ok: false, error: ctx.error ?? "Laden mislukt" };
  const catalog = buildVcCatalog(ctx.wb.inputs);
  const byKey = new Map(catalog.map((entry) => [entry.key, entry]));
  const refs = [];
  for (const key of new Set(d.refKeys)) {
    const entry = byKey.get(key);
    if (!entry) return { ok: false, error: "Ongeldige bronverwijzing: bron bestaat niet (meer)" };
    refs.push({
      ref_type: entry.ref_type,
      ref_id: entry.ref_id,
      label: entry.label,
      excerpt: entry.text.slice(0, 600),
      interpretation: false,
    });
  }
  const time = d.timeValue.trim() === "" ? null : canonicalAmount(d.timeValue);
  if (time && "error" in time) {
    return { ok: false, error: "Tijdsbesteding is niet eenduidig. Laat het veld leeg als de tijd onbekend is." };
  }
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("upsert_vc_activity", {
    p_chain_id: d.chainId,
    p_activity_id: d.activityId,
    p_name: d.name,
    p_category: d.category,
    p_description: d.description,
    p_inputs: d.inputsText,
    p_outputs: d.outputsText,
    p_customer_value: d.customerValue,
    p_capabilities: d.capabilitiesNote,
    p_owner: d.ownerName,
    p_execution: d.execution,
    p_time_value: time == null ? "" : minorToAmountString(time.minor),
    p_time_unit: d.timeUnit,
    p_time_scope: d.timeScope,
    p_time_basis: d.timeBasis,
    p_time_source: d.timeSource,
    p_observation: d.observation,
    p_explanation: d.explanation,
    p_improvement: d.improvement,
    p_effect: d.effect,
    p_motivation: d.motivation,
    p_open_question: d.openQuestion,
    p_question_status: d.questionStatus,
    p_question_answer: d.questionAnswer,
    p_advisor_note: d.advisorNote,
    p_evidence: d.evidenceLevel,
    p_refs: refs,
    p_subactivities: d.subactivities.filter((name) => name.trim().length >= 2).map((name, index) => ({ name, sort_order: index })),
    p_expected_updated_at: d.expectedUpdatedAt,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

async function findVersionId(tenantId: string, chainId: string): Promise<string | null> {
  const loaded = await loadValueChainWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) return null;
  return loaded.data.chains.some((chain) => chain.id === chainId) ? loaded.data.version.id : null;
}

export async function archiveVcActivityAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcActivityIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("archive_vc_activity", {
    p_activity_id: parsed.data.activityId,
    p_detach: parsed.data.detach ?? false,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function mergeVcActivitiesAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcMergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("merge_vc_activities", {
    p_target_id: parsed.data.targetId,
    p_source_id: parsed.data.sourceId,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function setVcApplicabilityAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcActivityIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vc_applicability", {
    p_activity_id: parsed.data.activityId,
    p_applicable: parsed.data.applicable ?? true,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function setVcActivityReviewAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcActivityIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vc_activity_review", {
    p_activity_id: parsed.data.activityId,
    p_reviewed: parsed.data.reviewed ?? true,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function saveVcDependencyAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcDependencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_dependency", {
    p_activity_id: d.activityId,
    p_dependency_id: d.dependencyId,
    p_to_activity_id: d.toActivityId,
    p_vrio_resource_id: d.vrioResourceId,
    p_partner_label: d.partnerLabel,
    p_kind: d.kind,
    p_description: d.description,
    p_evidence: d.evidenceLevel,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function deleteVcDependencyAction(tenantId: string, dependencyId: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("delete_vc_dependency", { p_dependency_id: dependencyId });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function prepareValueChainAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ activities: number }>> {
  const parsed = vcPrepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadValueChainWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Laden mislukt" : loaded.error };
  const chain = loaded.data.chains.find((item) => item.id === parsed.data.chainId);
  if (!chain) return { ok: false, error: "Waardeketen niet gevonden" };
  if (!chain.scope_confirmed) return { ok: false, error: "Bevestig eerst wat je onderzoekt." };

  const catalog = buildVcCatalog(loaded.data.inputs);
  const prepared = await prepareValueChainWithAi({
    tenantName: loaded.data.inputs.tenant.name,
    businessType: chain.business_type,
    offering: chain.offering,
    market: chain.market,
    periodLabel: chain.period_label,
    goal: chain.goal,
    catalog,
    activities: chain.activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      category: activity.category,
    })),
    onlyActivityId: parsed.data.activityId,
  });

  const payload = prepared.activities.map((activity) => ({
    ...activity,
    refs: activity.refs.map((ref) => ({ ...ref, interpretation: true })),
  }));
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_ai_result", {
    p_chain_id: chain.id,
    p_activities: payload,
    p_synthesis: [prepared.synthesis, prepared.missing.length ? `Nog te achterhalen: ${prepared.missing.join("; ")}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true, data: { activities: payload.length } };
}

export async function resolveVcAiAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcResolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("resolve_vc_ai_proposal", {
    p_activity_id: parsed.data.activityId,
    p_accept: parsed.data.accept,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function saveVcSynthesisAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcSynthesisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_synthesis", {
    p_version_id: d.versionId,
    p_text: d.synthesisText,
    p_public: d.synthesisPublic,
    p_reviewed: d.reviewed,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function saveVcActionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_action", {
    p_version_id: d.versionId,
    p_action_id: d.actionId,
    p_activity_id: d.activityId,
    p_title: d.title,
    p_problem: d.problem,
    p_outcome: d.expectedOutcome,
    p_owner: d.ownerName,
    p_evaluation: d.evaluation,
    p_deadline: d.deadline,
    p_status: d.status,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function saveVcImportAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  if (d.fileKind === "pdf" && !d.csvText.trim()) {
    return { ok: false, error: "Een scan-PDF wordt niet gelezen: OCR is niet beschikbaar. Plak de leesbare tekst." };
  }
  if (d.fileKind === "xlsx") {
    return {
      ok: false,
      error: "Macro's en externe koppelingen in een spreadsheet worden niet uitgevoerd. Exporteer het tabblad als CSV of plak de kolommen.",
    };
  }
  const table = mapCsvLines(
    parseCsv(d.csvText).rows,
    { description: d.descriptionColumn, amount: d.amountColumn, code: d.codeColumn ?? undefined },
    d.decimal,
  );
  const lines = table.map((line) => ({
    row_index: line.rowIndex,
    account_code: line.code,
    description: line.description,
    amount: line.amount ?? "",
    source_location: `rij ${line.rowIndex + 1}`,
    line_kind: line.kind,
    in_scope: true,
    is_revenue: /omzet|opbrengst|revenue/i.test(line.description),
    uncertain: line.uncertain,
    formula: line.formula,
    possible_duplicate: line.possibleDuplicate,
    category_label: "",
  }));
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_import", {
    p_version_id: d.versionId,
    p_chain_id: d.chainId,
    p_file_kind: d.fileKind,
    p_file_name: d.fileName,
    p_content_hash: createHash("sha256").update(d.csvText).digest("hex"),
    p_entity: d.entityLabel,
    p_period: d.periodLabel,
    p_currency: d.currency,
    p_scale: d.scale,
    p_figure_type: d.figureType,
    p_scope_level: d.scopeLevel,
    p_lines: lines,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function setVcLineAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const parsedAmount = d.amount.trim() === "" ? null : canonicalAmount(d.amount);
  if (parsedAmount && "error" in parsedAmount) return { ok: false, error: parsedAmount.error };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vc_line", {
    p_line_id: d.lineId,
    p_description: d.description,
    p_amount: parsedAmount == null ? "" : minorToAmountString(parsedAmount.minor),
    p_in_scope: d.inScope,
    p_out_reason: d.outReason,
    p_is_revenue: d.isRevenue,
    p_status: d.status,
    p_kind: d.kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function confirmVcImportAction(tenantId: string, importId: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("confirm_vc_import", { p_import_id: importId });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function saveVcAllocationAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcAllocationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const amount = canonicalAmount(d.amount);
  if ("error" in amount) return { ok: false, error: amount.error };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_vc_allocation", {
    p_line_id: d.lineId,
    p_activity_id: d.activityId,
    p_amount: minorToAmountString(amount.minor),
    p_method: d.method,
    p_motivation: d.motivation,
    p_formula: d.formula,
    p_confirm: d.confirm,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function setVcCostRateAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcCostRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const rate = d.rate.trim() === "" ? null : canonicalAmount(d.rate);
  if (d.confirmed && (rate == null || "error" in rate)) {
    return { ok: false, error: "Een bevestigde kostprijs heeft een bedrag nodig. Een factuurtarief is niet automatisch de interne kostprijs." };
  }
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vc_cost_rate", {
    p_version_id: d.versionId,
    p_rate: rate == null || "error" in rate ? "" : minorToAmountString(rate.minor),
    p_currency: d.currency,
    p_unit: d.unit,
    p_confirmed: d.confirmed,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function setVcFinanceFlagsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcFinanceFlagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_vc_finance_flags", {
    p_version_id: parsed.data.versionId,
    p_deferred: parsed.data.deferred,
    p_publish: parsed.data.publish,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function approveValueChainAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = vcApproveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("approve_vc_version", {
    p_version_id: parsed.data.versionId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}

export async function createVcRevisionAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("create_vc_revision", { p_tenant_id: tenantId });
  if (error) return { ok: false, error: error.message };
  revalidateVc(tenantId);
  return { ok: true };
}
