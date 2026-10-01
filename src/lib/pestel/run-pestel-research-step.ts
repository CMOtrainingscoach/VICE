import { createClient } from "@/lib/supabase/server";
import {
  PESTEL_DIMENSIONS,
  type PestelDimension,
} from "@/lib/pestel/constants";
import {
  buildResearchContextPayload,
  type PestelResearchContext,
} from "@/lib/pestel/build-research-context";
import { generatePestelDimensionInsights } from "@/lib/pestel/pestel-research-ai";
import {
  allowedWebUrlSet,
  fetchPestelWebEvidence,
} from "@/lib/pestel/pestel-web-evidence";
import type { PestelVersion } from "@/lib/pestel/types";

type ResearchJobRow = {
  id: string;
  version_id: string;
  tenant_id: string;
  status: string;
  progress: {
    phase?: string;
    message?: string;
    dimensions_done?: string[];
    current_dimension?: string;
  };
  error_message?: string | null;
  insights_created: number;
};

function nextDimension(done: string[]): PestelDimension | null {
  for (const d of PESTEL_DIMENSIONS) {
    if (!done.includes(d)) return d;
  }
  return null;
}

async function loadContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  version: PestelVersion,
  versionId: string,
): Promise<PestelResearchContext> {
  const { data: tenant } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("name, website, audit_goal, vat_number")
    .eq("id", tenantId)
    .maybeSingle();

  const { data: meetings } = await supabase
    .schema("app")
    .from("meeting_recordings")
    .select(
      "id, title, review_status, summary_text, full_text, notes, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("transcript_status", "ready")
    .order("created_at", { ascending: false })
    .limit(12);

  if (!tenant) {
    throw new Error("Klant niet gevonden");
  }

  const { data: inputsJson, error: inputsError } = await supabase
    .schema("app")
    .rpc("get_pestel_version_research_inputs", { p_version_id: versionId });

  if (inputsError) {
    throw new Error(inputsError.message);
  }

  const researchInputs = (inputsJson ?? []) as {
    id: string;
    kind: "meeting" | "website" | "document" | "note";
    meeting_recording_id: string | null;
    label: string;
    url: string | null;
    excerpt: string;
  }[];

  return buildResearchContextPayload(
    tenant as {
      name: string;
      website: string | null;
      audit_goal: string;
      vat_number: string | null;
    },
    version,
    (meetings ?? []) as {
      id: string;
      title: string | null;
      review_status: string;
      summary_text: string | null;
      full_text: string | null;
      notes: string | null;
      created_at: string;
    }[],
    researchInputs.map((i) => ({
      id: i.id,
      kind: i.kind,
      meeting_recording_id: i.meeting_recording_id,
      label: i.label ?? "",
      url: i.url,
      excerpt: i.excerpt ?? "",
    })),
  );
}

export type PestelResearchStepResult = {
  status: string;
  message: string;
  done: boolean;
  dimensionsDone: string[];
  currentDimension: PestelDimension | null;
  phase: string;
};

export async function runPestelResearchStep(jobId: string): Promise<PestelResearchStepResult> {
  const supabase = await createClient();

  const { data: jobData, error: jobError } = await supabase
    .schema("app")
    .rpc("get_pestel_research_job", { p_job_id: jobId });

  if (jobError || !jobData) {
    throw new Error(jobError?.message ?? "Job niet gevonden");
  }

  const job = jobData as ResearchJobRow;
  if (job.status === "completed" || job.status === "cancelled") {
    const finished = job.progress?.dimensions_done ?? [];
    return {
      status: job.status,
      message: "Afgerond",
      done: true,
      dimensionsDone: finished,
      currentDimension: null,
      phase: "done",
    };
  }
  if (job.status === "failed") {
    return {
      status: job.status,
      message: job.error_message ?? job.progress?.message ?? "Mislukt",
      done: true,
      dimensionsDone: job.progress?.dimensions_done ?? [],
      currentDimension: (job.progress?.current_dimension as PestelDimension) ?? null,
      phase: "error",
    };
  }

  const { data: scopeJson, error: scopeError } = await supabase
    .schema("app")
    .rpc("get_pestel_version_scope", { p_version_id: job.version_id });

  if (scopeError || !scopeJson) {
    throw new Error(scopeError?.message ?? "Versie niet gevonden");
  }

  const versionRow = scopeJson as {
    id: string;
    market_sector: string;
    geo_markets: unknown;
    time_horizon: string;
    services_offerings: string;
    offering_audience: string;
    research_question: string;
  };

  const geo = Array.isArray(versionRow.geo_markets)
    ? (versionRow.geo_markets as string[])
    : [];

  const version: PestelVersion = {
    id: versionRow.id,
    version_number: 0,
    status: "research_running",
    market_sector: versionRow.market_sector as string,
    geo_markets: geo,
    time_horizon: versionRow.time_horizon as string,
    services_offerings: (versionRow.services_offerings as string) ?? "",
    offering_audience: versionRow.offering_audience as string,
    research_question: versionRow.research_question as string,
    results_stale: false,
    synthesis_text: "",
    synthesis_stale: false,
    synthesis_reviewed: false,
    updated_at: "",
  };

  const done = [...(job.progress?.dimensions_done ?? [])];
  const dimension = nextDimension(done);

  if (!dimension) {
    await supabase.schema("app").rpc("update_pestel_research_progress", {
      p_job_id: jobId,
      p_status: "completed",
      p_progress: {
        phase: "done",
        message: "Onderzoek afgerond",
        dimensions_done: done,
      },
      p_error_message: null,
      p_insights_created_delta: 0,
    });
    return {
      status: "completed",
      message: "Onderzoek afgerond",
      done: true,
      dimensionsDone: done,
      currentDimension: null,
      phase: "done",
    };
  }

  await supabase.schema("app").rpc("update_pestel_research_progress", {
    p_job_id: jobId,
    p_status: "running",
    p_progress: {
      phase: "web_search",
      message: `Live webonderzoek (${dimension})…`,
      dimensions_done: done,
      current_dimension: dimension,
    },
    p_error_message: null,
    p_insights_created_delta: 0,
  });

  try {
    const ctx = await loadContext(supabase, job.tenant_id, version, job.version_id);
    const webEvidence = await fetchPestelWebEvidence({ dimension, context: ctx });
    const allowedWebUrls = allowedWebUrlSet(webEvidence);

    await supabase.schema("app").rpc("update_pestel_research_progress", {
      p_job_id: jobId,
      p_status: "running",
      p_progress: {
        phase: "research",
        message: `Perspectief ${dimension} uitwerken (${webEvidence.length} webbronnen)…`,
        dimensions_done: done,
        current_dimension: dimension,
      },
      p_error_message: null,
      p_insights_created_delta: 0,
    });

    const allowedMeetingIds = new Set(ctx.meetings.map((m) => m.id));
    const insights = await generatePestelDimensionInsights({
      dimension,
      context: ctx,
      allowedMeetingIds,
      webEvidence,
      allowedWebUrls,
    });

    let created = 0;
    for (const ins of insights) {
      const sourcesPayload = ins.sources.map((s) => ({
        source_type: s.source_type,
        label: s.label,
        url: s.url ?? null,
        publisher: s.publisher ?? null,
        excerpt: s.excerpt,
        meeting_recording_id: s.meeting_recording_id ?? null,
        meeting_offset_ms: s.meeting_offset_ms ?? null,
        is_ai_interpretation: s.is_ai_interpretation ?? false,
      }));

      const { error: insError } = await supabase.schema("app").rpc(
        "insert_pestel_ai_insight",
        {
          p_version_id: job.version_id,
          p_job_id: jobId,
          p_dimension: dimension,
          p_title: ins.title,
          p_observation: ins.observation,
          p_client_relevance: ins.client_relevance,
          p_opportunity_risk: ins.opportunity_risk,
          p_impact: ins.impact,
          p_impact_note: ins.impact_note ?? "",
          p_insight_time_horizon: ins.insight_time_horizon ?? version.time_horizon,
          p_evidence_level: ins.evidence_level,
          p_sources: sourcesPayload,
        },
      );
      if (insError) {
        throw new Error(insError.message);
      }
      created += 1;
    }

    done.push(dimension);
    const hasMore = nextDimension(done) !== null;

    await supabase.schema("app").rpc("update_pestel_research_progress", {
      p_job_id: jobId,
      p_status: hasMore ? "running" : "completed",
      p_progress: {
        phase: hasMore ? "research" : "done",
        message: hasMore
          ? `Klaar met ${dimension} — volgende perspectief…`
          : "Onderzoek afgerond",
        dimensions_done: done,
      },
      p_error_message: null,
      p_insights_created_delta: created,
    });

    return {
      status: hasMore ? "running" : "completed",
      message: hasMore ? `Perspectief ${dimension} opgeslagen` : "Onderzoek afgerond",
      done: !hasMore,
      dimensionsDone: done,
      currentDimension: hasMore ? nextDimension(done) : null,
      phase: hasMore ? "research" : "done",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onderzoek mislukt";
    await supabase.schema("app").rpc("update_pestel_research_progress", {
      p_job_id: jobId,
      p_status: "failed",
      p_progress: {
        phase: "error",
        message: msg,
        dimensions_done: done,
        current_dimension: dimension,
      },
      p_error_message: msg,
      p_insights_created_delta: 0,
    });
    return {
      status: "failed",
      message: msg,
      done: true,
      dimensionsDone: done,
      currentDimension: dimension,
      phase: "error",
    };
  }
}
