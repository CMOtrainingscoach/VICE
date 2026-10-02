"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import { MARKETING_5C_ROUTE } from "@/lib/marketing-5c/constants";
import { porterWebResearchConfigured } from "@/lib/porter/porter-web-evidence";
import { generatePorterVersionSynthesis } from "@/lib/porter/porter-synthesis-ai";
import { runPorterResearchStep } from "@/lib/porter/run-porter-research-step";
import type { PorterForceKey } from "@/lib/porter/constants";
import type { PorterResearchJob, PorterWorkbench } from "@/lib/porter/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import {
  porterApproveSchema,
  porterForceSchema,
  porterScopeSchema,
  porterSynthesisAiSchema,
  porterSynthesisSchema,
} from "@/modules/porter/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidatePorter(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/porter`);
  revalidatePath(`/klanten/${tenantId}/strategie/${MARKETING_5C_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
}

export type AuditFrameworkProgress = {
  pestelApproved: boolean;
  porterApproved: boolean;
  fiveCApproved: boolean;
  swotApproved: boolean;
  vrioApproved: boolean;
  bcgApproved: boolean;
  valueChainApproved: boolean;
  valueChainStarted: boolean;
};

export async function getAuditFrameworkProgressAction(
  tenantId: string,
): Promise<ActionResult<AuditFrameworkProgress>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_audit_framework_progress", {
    p_tenant_id: tenantId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as {
    pestel_approved?: boolean;
    porter_approved?: boolean;
    five_c_approved?: boolean;
    swot_approved?: boolean;
    vrio_approved?: boolean;
    bcg_approved?: boolean;
    value_chain_approved?: boolean;
    value_chain_started?: boolean;
  };

  return {
    ok: true,
    data: {
      pestelApproved: Boolean(raw?.pestel_approved),
      porterApproved: Boolean(raw?.porter_approved),
      fiveCApproved: Boolean(raw?.five_c_approved),
      swotApproved: Boolean(raw?.swot_approved),
      vrioApproved: Boolean(raw?.vrio_approved),
      bcgApproved: Boolean(raw?.bcg_approved),
      valueChainApproved: Boolean(raw?.value_chain_approved),
      valueChainStarted: Boolean(raw?.value_chain_started),
    },
  };
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

export async function generatePorterSynthesisAiAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult<{ text: string }>> {
  const parsed = porterSynthesisAiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssue(parsed.error) };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const loaded = await loadPorterWorkbenchAction(tenantId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  if (!loaded.data) {
    return { ok: false, error: "Workbench laden mislukt" };
  }

  if (loaded.data.version.id !== parsed.data.versionId) {
    return { ok: false, error: "Versie komt niet overeen" };
  }

  const forces = loaded.data.forces.filter(
    (f) =>
      f.intensity !== "unknown"
      || f.motivation.trim().length >= 20
      || f.headline_factor.trim().length >= 5,
  );

  if (forces.length < 5) {
    return {
      ok: false,
      error: "Vul eerst alle vijf krachten in voordat je een AI-synthese maakt.",
    };
  }

  try {
    const text = await generatePorterVersionSynthesis({
      tenantName: parsed.data.tenantName,
      scope: {
        market_sector: loaded.data.version.market_sector,
        offering_description: loaded.data.version.offering_description,
        geo_markets: loaded.data.version.geo_markets,
        client_segment: loaded.data.version.client_segment,
        time_horizon: loaded.data.version.time_horizon,
        research_question: loaded.data.version.research_question,
      },
      forces: forces.map((f) => ({
        force_key: f.force_key as PorterForceKey,
        intensity: f.intensity,
        headline_factor: f.headline_factor,
        motivation: f.motivation,
        client_relevance: f.client_relevance,
      })),
    });
    return { ok: true, data: { text } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI-synthese mislukt",
    };
  }
}

export async function approvePorterVersionAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = porterApproveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssue(parsed.error) };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("approve_porter_version", {
    p_version_id: parsed.data.versionId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePorter(tenantId);
  return { ok: true };
}
