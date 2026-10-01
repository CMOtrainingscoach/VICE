"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import { MARKETING_5C_ROUTE } from "@/lib/marketing-5c/constants";
import { SWOT_ROUTE } from "@/lib/swot/constants";
import { buildSwotCatalog } from "@/lib/swot/input-catalog";
import { generateSwotDraft } from "@/lib/swot/swot-synthesis-ai";
import type { SwotQuadrant } from "@/lib/swot/constants";
import type { SwotWorkbench } from "@/lib/swot/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import {
  swotAdjustmentSchema,
  swotAiSchema,
  swotApproveSchema,
  swotQuadrantSchema,
  swotReviewSchema,
} from "@/modules/swot/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateSwot(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${MARKETING_5C_ROUTE}`);
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

export async function loadSwotWorkbenchAction(
  tenantId: string,
): Promise<ActionResult<SwotWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_swot_workbench", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: error.message };

  const raw = data as Record<string, unknown> & {
    version: SwotWorkbench["version"];
    upstream: SwotWorkbench["upstream"];
    inputs: SwotWorkbench["inputs"];
  };

  return {
    ok: true,
    data: {
      version: raw.version,
      upstream: raw.upstream,
      items: asArray<SwotWorkbench["items"][number]>(raw.items).map((i) => ({
        ...i,
        refs: asArray(i.refs),
      })),
      inputs: raw.inputs,
    },
  };
}

export async function saveSwotQuadrantAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = swotQuadrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const statements = parsed.data.statements.map((row) => ({
    statement: row.statement,
    origin: row.origin ?? "manual",
    refs: row.refs ?? [],
  }));

  const { error } = await supabase.schema("app").rpc("replace_swot_quadrant", {
    p_version_id: parsed.data.versionId,
    p_quadrant: parsed.data.quadrant,
    p_statements: statements,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSwot(tenantId);
  return { ok: true };
}

export async function setSwotAdjustmentNoteAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = swotAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_swot_adjustment_note", {
    p_version_id: parsed.data.versionId,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSwot(tenantId);
  return { ok: true };
}

export async function setSwotAdvisorReviewedAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = swotReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("set_swot_advisor_reviewed", {
    p_version_id: parsed.data.versionId,
    p_reviewed: parsed.data.reviewed,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSwot(tenantId);
  return { ok: true };
}

export async function generateSwotAiAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = swotAiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const loaded = await loadSwotWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return { ok: false, error: loaded.ok ? "Workbench leeg" : loaded.error };
  }
  if (loaded.data.version.id !== parsed.data.versionId) {
    return { ok: false, error: "Versie komt niet overeen" };
  }
  if (loaded.data.version.status === "approved") {
    return { ok: false, error: "Goedgekeurde SWOT is alleen-lezen" };
  }

  const catalog = buildSwotCatalog(loaded.data.inputs);
  let draft;
  try {
    draft = await generateSwotDraft({
      tenantName: loaded.data.inputs.tenant.name,
      catalog,
      adjustmentNote: parsed.data.adjustmentNote ?? loaded.data.version.adjustment_note,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI mislukt" };
  }

  const quadrants: Record<string, { statement: string; refs: unknown[] }[]> = {};
  let count = 0;
  for (const [q, items] of Object.entries(draft) as [SwotQuadrant, typeof draft.strength][]) {
    quadrants[q] = items.map((i) => {
      count += 1;
      return { statement: i.statement, refs: i.refs };
    });
  }

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("save_swot_ai_result", {
    p_version_id: parsed.data.versionId,
    p_quadrants: quadrants,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSwot(tenantId);
  return { ok: true, data: { count } };
}

export async function approveSwotVersionAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = swotApproveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };

  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("approve_swot_version", {
    p_version_id: parsed.data.versionId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return { ok: false, error: error.message };

  revalidateSwot(tenantId);
  return { ok: true };
}
