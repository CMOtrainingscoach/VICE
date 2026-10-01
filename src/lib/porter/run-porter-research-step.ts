import { createClient } from "@/lib/supabase/server";
import {
  PORTER_FORCES,
  PORTER_FORCE_META,
  type PorterForceKey,
} from "@/lib/porter/constants";
import type { PorterResearchContext } from "@/lib/porter/build-research-context";
import type { PorterPestelInsightSummary } from "@/lib/porter/types";
import { generatePorterForceAnalysis } from "@/lib/porter/porter-research-ai";
import {
  allowedPorterWebUrlSet,
  fetchPorterWebEvidence,
} from "@/lib/porter/porter-web-evidence";

type ResearchJobRow = {
  id: string;
  version_id: string;
  tenant_id: string;
  status: string;
  progress: {
    phase?: string;
    message?: string;
    forces_done?: string[];
    current_force?: string;
  };
  error_message?: string | null;
};

function nextForce(done: string[]): PorterForceKey | null {
  for (const f of PORTER_FORCES) {
    if (!done.includes(f)) return f;
  }
  return null;
}

export type PorterResearchStepResult = {
  status: string;
  message: string;
  done: boolean;
  forcesDone: string[];
  currentForce: PorterForceKey | null;
  phase: string;
};

export async function runPorterResearchStep(jobId: string): Promise<PorterResearchStepResult> {
  const supabase = await createClient();

  const { data: jobRow, error: jobError } = await supabase
    .schema("app")
    .rpc("get_porter_research_job", { p_job_id: jobId });

  if (jobError || !jobRow) {
    throw new Error(jobError?.message ?? "Job niet gevonden");
  }

  const job = jobRow as ResearchJobRow;
  if (job.status === "completed" || job.status === "cancelled") {
    return {
      status: job.status,
      message: "Afgerond",
      done: true,
      forcesDone: job.progress?.forces_done ?? [],
      currentForce: null,
      phase: "done",
    };
  }
  if (job.status === "failed") {
    return {
      status: job.status,
      message: job.error_message ?? job.progress?.message ?? "Mislukt",
      done: true,
      forcesDone: job.progress?.forces_done ?? [],
      currentForce: (job.progress?.current_force as PorterForceKey) ?? null,
      phase: "error",
    };
  }

  const { data: scopeJson, error: scopeError } = await supabase
    .schema("app")
    .rpc("get_porter_version_scope", { p_version_id: job.version_id });

  if (scopeError || !scopeJson || typeof scopeJson !== "object") {
    throw new Error(scopeError?.message ?? "Versie niet gevonden");
  }

  const scope = scopeJson as {
    id: string;
    tenant_id: string;
    pestel_version_id: string | null;
    market_sector: string;
    offering_description: string;
    geo_markets: unknown;
    client_segment: string;
    time_horizon: string;
    research_question: string;
    known_competitors: unknown;
  };

  const geo = Array.isArray(scope.geo_markets) ? (scope.geo_markets as string[]) : [];
  const competitors = Array.isArray(scope.known_competitors)
    ? (scope.known_competitors as { name: string; url?: string }[])
    : [];

  const { data: tenantJson, error: tenantError } = await supabase
    .schema("app")
    .rpc("get_pestel_research_tenant_profile", { p_tenant_id: job.tenant_id });

  if (tenantError || !tenantJson || typeof tenantJson !== "object") {
    throw new Error(tenantError?.message ?? "Klantprofiel niet geladen");
  }

  const tenant = tenantJson as {
    name: string;
    website: string | null;
    audit_goal: string;
  };

  let pestelInsights: PorterPestelInsightSummary[] = [];
  if (scope.pestel_version_id) {
    const { data: insJson, error: insError } = await supabase
      .schema("app")
      .rpc("list_porter_pestel_insights", { p_pestel_version_id: scope.pestel_version_id });

    if (insError) {
      throw new Error(insError.message);
    }
    pestelInsights = (insJson ?? []) as PorterPestelInsightSummary[];
  }

  const context: PorterResearchContext = {
    tenant: {
      name: tenant.name,
      website: tenant.website,
      audit_goal: tenant.audit_goal ?? "",
    },
    scope: {
      market_sector: scope.market_sector,
      offering_description: scope.offering_description,
      client_segment: scope.client_segment,
      geo_markets: geo,
      time_horizon: scope.time_horizon,
      research_question: scope.research_question,
      known_competitors: competitors,
    },
    pestelInsights,
  };

  const { data: forcesJson, error: forcesError } = await supabase
    .schema("app")
    .rpc("list_porter_force_ids", { p_version_id: job.version_id });

  if (forcesError) {
    throw new Error(forcesError.message);
  }

  const forceIdByKey = new Map<string, string>();
  for (const row of (forcesJson ?? []) as { id: string; force_key: string }[]) {
    forceIdByKey.set(row.force_key, row.id);
  }

  const done = [...(job.progress?.forces_done ?? [])];
  const forceKey = nextForce(done);

  if (!forceKey) {
    await supabase.schema("app").rpc("update_porter_research_progress", {
      p_job_id: jobId,
      p_status: "completed",
      p_progress: {
        phase: "done",
        message: "Analyse afgerond",
        forces_done: done,
      },
      p_error_message: null,
      p_forces_updated_delta: 0,
    });
    return {
      status: "completed",
      message: "Analyse afgerond",
      done: true,
      forcesDone: done,
      currentForce: null,
      phase: "done",
    };
  }

  const forceId = forceIdByKey.get(forceKey);
  if (!forceId) {
    throw new Error(`Kracht ${forceKey} niet gevonden in database`);
  }

  const forceLabel = PORTER_FORCE_META[forceKey].shortLabel;

  await supabase.schema("app").rpc("update_porter_research_progress", {
    p_job_id: jobId,
    p_status: "running",
    p_progress: {
      phase: "web_search",
      message: `Live webonderzoek (${forceLabel})…`,
      forces_done: done,
      current_force: forceKey,
    },
    p_error_message: null,
    p_forces_updated_delta: 0,
  });

  try {
    const webEvidence = await fetchPorterWebEvidence({ forceKey, context });
    const allowedWebUrls = allowedPorterWebUrlSet(webEvidence);

    await supabase.schema("app").rpc("update_porter_research_progress", {
      p_job_id: jobId,
      p_status: "running",
      p_progress: {
        phase: "research",
        message: `${forceLabel} uitwerken (${webEvidence.length} webbronnen)…`,
        forces_done: done,
        current_force: forceKey,
      },
      p_error_message: null,
      p_forces_updated_delta: 0,
    });

    const analysis = await generatePorterForceAnalysis({
      forceKey,
      context,
      webEvidence,
      allowedWebUrls,
    });

    const factorsPayload = analysis.factors.map((f) => ({
      title: f.title,
      observation: f.observation,
      effect: f.effect,
      effect_note: f.effect_note ?? "",
      evidence_level: f.evidence_level,
      pestel_insight_id: f.pestel_insight_id ?? null,
      sources: f.sources.map((s) => ({
        source_type: s.source_type,
        label: s.label,
        url: s.url ?? null,
        publisher: s.publisher ?? null,
        excerpt: s.excerpt,
        pestel_insight_id: s.pestel_insight_id ?? null,
      })),
    }));

    const { error: saveError } = await supabase.schema("app").rpc("save_porter_ai_force_analysis", {
      p_version_id: job.version_id,
      p_force_id: forceId,
      p_intensity: analysis.intensity,
      p_motivation: analysis.motivation,
      p_client_relevance: analysis.client_relevance,
      p_headline_factor: analysis.headline_factor,
      p_factors: factorsPayload,
    });

    if (saveError) {
      throw new Error(saveError.message);
    }

    done.push(forceKey);
    const hasMore = nextForce(done) !== null;

    await supabase.schema("app").rpc("update_porter_research_progress", {
      p_job_id: jobId,
      p_status: hasMore ? "running" : "completed",
      p_progress: {
        phase: hasMore ? "research" : "done",
        message: hasMore ? `${forceLabel} opgeslagen — volgende kracht…` : "Analyse afgerond",
        forces_done: done,
      },
      p_error_message: null,
      p_forces_updated_delta: 1,
    });

    return {
      status: hasMore ? "running" : "completed",
      message: hasMore ? `${forceLabel} opgeslagen` : "Analyse afgerond",
      done: !hasMore,
      forcesDone: done,
      currentForce: hasMore ? nextForce(done) : null,
      phase: hasMore ? "research" : "done",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analyse mislukt";
    await supabase.schema("app").rpc("update_porter_research_progress", {
      p_job_id: jobId,
      p_status: "failed",
      p_progress: {
        phase: "error",
        message: msg,
        forces_done: done,
        current_force: forceKey,
      },
      p_error_message: msg,
      p_forces_updated_delta: 0,
    });
    return {
      status: "failed",
      message: msg,
      done: true,
      forcesDone: done,
      currentForce: forceKey,
      phase: "error",
    };
  }
}
