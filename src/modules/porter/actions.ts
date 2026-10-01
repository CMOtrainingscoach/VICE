"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import { porterWebResearchConfigured } from "@/lib/porter/porter-web-evidence";
import { runPorterResearchStep } from "@/lib/porter/run-porter-research-step";
import type { PorterResearchJob, PorterWorkbench } from "@/lib/porter/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import {
  porterForceSchema,
  porterScopeSchema,
  porterSynthesisSchema,
} from "@/modules/porter/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidatePorter(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/porter`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
}

export async function loadPorterWorkbenchAction(
  tenantId: string,
): Promise<ActionResult<PorterWorkbench>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_porter_workbench", {
    p_tenant_id: tenantId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as {
    version: PorterWorkbench["version"] & { geo_markets: unknown; known_competitors: unknown };
    forces: PorterWorkbench["forces"];
    pestel_context: PorterWorkbench["pestelContext"] & { insights: unknown };
    active_research_job: PorterResearchJob | null;
    last_research_error: string | null;
  };

  const geo = Array.isArray(raw.version.geo_markets) ?
    (raw.version.geo_markets as string[])
  : [];

  const competitors = Array.isArray(raw.version.known_competitors) ?
    (raw.version.known_competitors as PorterWorkbench["version"]["known_competitors"])
  : [];

  return {
    ok: true,
    data: {
      version: {
        ...raw.version,
        geo_markets: geo,
        known_competitors: competitors,
      },
      forces: raw.forces ?? [],
      pestelContext: {
        version_id: raw.pestel_context?.version_id ?? null,
        version_number: raw.pestel_context?.version_number ?? null,
        approved: Boolean(raw.pestel_context?.approved),
        insights: (raw.pestel_context?.insights ?? []) as PorterWorkbench["pestelContext"]["insights"],
      },
      activeResearchJob: raw.active_research_job ?? null,
      lastResearchError: raw.last_research_error ?? null,
    },
  };
}

export async function startPorterResearchAction(
  tenantId: string,
  versionId: string,
): Promise<ActionResult<{ jobId: string }>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  if (!porterWebResearchConfigured()) {
    return {
      ok: false,
      error:
        "Live webonderzoek ontbreekt: voeg TAVILY_API_KEY toe in Vercel/.env.local (zelfde als PESTEL).",
    };
  }

  const supabase = await createClient();
  const { data: jobId, error } = await supabase.schema("app").rpc("start_porter_research", {
    p_version_id: versionId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePorter(tenantId);
  return { ok: true, data: { jobId: jobId as string } };
}

export async function cancelPorterResearchAction(
  tenantId: string,
  jobId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("cancel_porter_research", {
    p_job_id: jobId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePorter(tenantId);
  return { ok: true };
}

export async function runPorterResearchStepAction(
  tenantId: string,
  jobId: string,
): Promise<
  ActionResult<{
    done: boolean;
    message: string;
    status: string;
    forcesDone: string[];
    currentForce: string | null;
    phase: string;
  }>
> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  void tenantId;

  try {
    const result = await runPorterResearchStep(jobId);
    revalidatePorter(tenantId);
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stap mislukt",
    };
  }
}

export async function savePorterScopeAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = porterScopeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssue(parsed.error) };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("update_porter_scope", {
    p_version_id: parsed.data.versionId,
    p_market_sector: parsed.data.marketSector,
    p_offering_description: parsed.data.offeringDescription,
    p_geo_markets: parsed.data.geoMarkets,
    p_client_segment: parsed.data.clientSegment,
    p_time_horizon: parsed.data.timeHorizon,
    p_research_question: parsed.data.researchQuestion,
    p_known_competitors: parsed.data.knownCompetitors ?? [],
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePorter(tenantId);
  return { ok: true };
}

export async function savePorterForceAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = porterForceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssue(parsed.error) };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("upsert_porter_force", {
    p_version_id: parsed.data.versionId,
    p_force_id: parsed.data.forceId,
    p_force_key: parsed.data.forceKey,
    p_intensity: parsed.data.intensity,
    p_motivation: parsed.data.motivation,
    p_client_relevance: parsed.data.clientRelevance,
    p_advisor_note: parsed.data.advisorNote,
    p_headline_factor: parsed.data.headlineFactor,
    p_mark_reviewed: parsed.data.markReviewed ?? false,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePorter(tenantId);
  return { ok: true };
}

export async function savePorterSynthesisAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = porterSynthesisSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssue(parsed.error) };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("update_porter_synthesis", {
    p_version_id: parsed.data.versionId,
    p_synthesis_text: parsed.data.synthesisText,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePorter(tenantId);
  return { ok: true };
}
