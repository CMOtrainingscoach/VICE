"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import type { PestelWorkbench } from "@/lib/pestel/types";
import { runPestelResearchStep } from "@/lib/pestel/run-pestel-research-step";
import type { PestelResearchJob } from "@/lib/pestel/types";
import {
  pestelInsightSchema,
  pestelScopeSchema,
  pestelSynthesisSchema,
} from "@/modules/pestel/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidatePestel(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/pestel`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
}

export async function loadPestelWorkbenchAction(
  tenantId: string,
): Promise<ActionResult<PestelWorkbench>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_pestel_workbench", {
    p_tenant_id: tenantId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as {
    version: PestelWorkbench["version"] & { geo_markets: unknown };
    insights: PestelWorkbench["insights"];
    meetings: PestelWorkbench["meetings"];
    active_research_job: PestelResearchJob | null;
  };

  const geo =
    Array.isArray(raw.version.geo_markets) ?
      (raw.version.geo_markets as string[])
    : [];

  return {
    ok: true,
    data: {
      version: { ...raw.version, geo_markets: geo },
      insights: raw.insights ?? [],
      meetings: raw.meetings ?? [],
      activeResearchJob: raw.active_research_job ?? null,
    },
  };
}

export async function startPestelResearchAction(
  tenantId: string,
  versionId: string,
): Promise<ActionResult<{ jobId: string }>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data: jobId, error } = await supabase.schema("app").rpc("start_pestel_research", {
    p_version_id: versionId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePestel(tenantId);
  return { ok: true, data: { jobId: jobId as string } };
}

export async function cancelPestelResearchAction(
  tenantId: string,
  jobId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("cancel_pestel_research", {
    p_job_id: jobId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePestel(tenantId);
  return { ok: true };
}

export async function runPestelResearchStepAction(
  tenantId: string,
  jobId: string,
): Promise<ActionResult<{ done: boolean; message: string; status: string }>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  void tenantId;

  try {
    const result = await runPestelResearchStep(jobId);
    revalidatePestel(tenantId);
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stap mislukt",
    };
  }
}

export async function savePestelScopeAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = pestelScopeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldige afbakening" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("update_pestel_scope", {
    p_version_id: parsed.data.versionId,
    p_market_sector: parsed.data.marketSector,
    p_geo_markets: parsed.data.geoMarkets,
    p_time_horizon: parsed.data.timeHorizon,
    p_offering_audience: parsed.data.offeringAudience,
    p_research_question: parsed.data.researchQuestion,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePestel(tenantId);
  return { ok: true };
}

export async function savePestelInsightAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ insightId: string }>> {
  const parsed = pestelInsightSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldig inzicht" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data: insightId, error } = await supabase.schema("app").rpc(
    "upsert_pestel_insight",
    {
      p_version_id: parsed.data.versionId,
      p_insight_id: parsed.data.insightId ?? null,
      p_dimension: parsed.data.dimension,
      p_title: parsed.data.title,
      p_observation: parsed.data.observation,
      p_client_relevance: parsed.data.clientRelevance,
      p_opportunity_risk: parsed.data.opportunityRisk,
      p_impact: parsed.data.impact,
      p_impact_note: parsed.data.impactNote,
      p_insight_time_horizon: parsed.data.insightTimeHorizon,
      p_evidence_level: parsed.data.evidenceLevel,
      p_advisor_note: parsed.data.advisorNote,
      p_mark_reviewed: parsed.data.markReviewed ?? false,
    },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  const id = insightId as string;
  const sourcesPayload = parsed.data.sources.map((s) => ({
    source_type: s.source_type,
    label: s.label,
    url: s.url || null,
    publisher: s.publisher || null,
    excerpt: s.excerpt,
    meeting_recording_id: s.meeting_recording_id || null,
    meeting_offset_ms: s.meeting_offset_ms ?? null,
  }));

  const { error: srcError } = await supabase.schema("app").rpc(
    "replace_pestel_insight_sources",
    {
      p_insight_id: id,
      p_sources: sourcesPayload,
    },
  );

  if (srcError) {
    return { ok: false, error: srcError.message };
  }

  revalidatePestel(tenantId);
  return { ok: true, data: { insightId: id } };
}

export async function deletePestelInsightAction(
  tenantId: string,
  insightId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("delete_pestel_insight", {
    p_insight_id: insightId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePestel(tenantId);
  return { ok: true };
}

export async function savePestelSynthesisAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = pestelSynthesisSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Ongeldige synthese" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("update_pestel_synthesis", {
    p_version_id: parsed.data.versionId,
    p_synthesis_text: parsed.data.synthesisText,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePestel(tenantId);
  return { ok: true };
}
