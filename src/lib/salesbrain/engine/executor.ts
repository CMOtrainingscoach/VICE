import OpenAI from "openai";
import { z } from "zod";
import { geocodeBusinessNearLocation, geocodePlaceLabel } from "@/lib/leadgen/google-geo";
import { haversineDistanceKm } from "@/lib/leadgen/haversine";
import { extractEmailsFromHtml, extractPhonesFromHtml, safeFetchUrl } from "@/lib/leadgen/safe-fetch";
import { normalizeWebsiteHost } from "@/lib/leadgen/web-search";
import { resolveMeetingAnalysisModel, modelSupportsCustomTemperature } from "@/lib/openai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SbWorkflowDefinition } from "@/lib/salesbrain/graph/types";
import { topoSort, type SbExecutionContext } from "@/lib/salesbrain/engine/context";
import { runGoogleFormsNode } from "@/lib/salesbrain/engine/nodes/google-forms";
import { runGa4SourceNode, runGscSourceNode, runTrendsImportNode } from "@/lib/salesbrain/engine/nodes/gsc-ga4";
import { runJobAdsNode } from "@/lib/salesbrain/engine/nodes/job-ads";
import { runWebResearchNode } from "@/lib/salesbrain/engine/nodes/web-research";
import { runWebsiteFetchNode } from "@/lib/salesbrain/engine/nodes/website-fetch";
import type { SearchHitArtifact } from "@/lib/salesbrain/engine/nodes/web-research";
import type { JobSignalArtifact } from "@/lib/salesbrain/engine/nodes/job-ads";
import type { PageEvidenceArtifact } from "@/lib/salesbrain/engine/nodes/website-fetch";

type RunRow = {
  id: string;
  tenant_id: string;
  is_test: boolean;
  status: string;
  deleted_at: string | null;
  inputs: Record<string, unknown>;
  graph: SbWorkflowDefinition;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  location_label: string;
};

export type QualifiedProspectPayload = {
  displayName: string;
  websiteHost: string | null;
  websiteUrl: string | null;
  municipality: string | null;
  distanceKm: number | null;
  geoVerified: boolean;
  geoEligible: boolean;
  assessmentSummary: string;
  signals: { label: string; kind: string; detail: string }[];
  limitations: string[];
  evidence: { kind: string; title: string; url: string; excerpt: string }[];
  contacts: { email: string | null; phone: string | null; sourceUrl: string | null };
};

const assessmentSchema = z.object({
  summary: z.string().max(800),
  signals: z.array(
    z.object({
      label: z.string(),
      kind: z.enum(["observed", "interpretation", "unverified"]),
      detail: z.string(),
    }),
  ),
  limitations: z.array(z.string()).max(6),
});

async function assessWithHtml(input: {
  goal: string;
  observations: string[];
  htmlExcerpt: string;
  searchExcerpt: string;
}): Promise<z.infer<typeof assessmentSchema> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.VICE_SALESBRAIN_MODEL?.trim() || process.env.VICE_LEADGEN_MODEL?.trim() || resolveMeetingAnalysisModel();
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.2 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Salesbrain: beoordeel alleen op meegeleverde HTML-excerpt en observaties. Geen verzonnen contactgegevens. JSON: summary, signals, limitations.",
      },
      {
        role: "user",
        content: [
          `Doel: ${input.goal}`,
          "Observaties:",
          ...input.observations.map((o) => `- ${o}`),
          `HTML excerpt:\n${input.htmlExcerpt.slice(0, 3500)}`,
          `Zoeksnippet:\n${input.searchExcerpt.slice(0, 500)}`,
        ].join("\n"),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  const parsed = assessmentSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

async function recordNodeAttempt(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  node: { id: string; type: string },
  status: "completed" | "failed" | "skipped",
  outputRef?: Record<string, unknown>,
  errorMessage?: string,
) {
  await admin.schema("app").rpc("sb_worker_record_node_attempt", {
    p_run_id: runId,
    p_node_id: node.id,
    p_node_type: node.type,
    p_status: status,
    p_output_ref: outputRef ?? null,
    p_error_message: errorMessage ?? null,
  });
}

async function updateSbProgress(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  status: string,
  progress: Record<string, unknown>,
  extras?: { prospectCount?: number; insightCount?: number; errorMessage?: string; warnings?: string[] },
) {
  await admin.schema("app").rpc("sb_worker_update_progress", {
    p_run_id: runId,
    p_status: status,
    p_progress: progress,
    p_prospect_count: extras?.prospectCount ?? null,
    p_insight_count: extras?.insightCount ?? null,
    p_error_message: extras?.errorMessage ?? null,
    p_warnings: extras?.warnings ? extras.warnings : null,
  });
}

function buildContext(row: RunRow): SbExecutionContext {
  const inputs = row.inputs ?? {};
  return {
    tenantId: row.tenant_id,
    runId: row.id,
    isTest: row.is_test,
    inputs,
    pinned: {
      goalText: String(inputs.goalText ?? ""),
      locationLabel: row.location_label,
      lat: row.center_lat,
      lng: row.center_lng,
      radiusKm: Number(row.radius_km),
      icpSnapshot: inputs.icpSnapshot as Record<string, unknown> | undefined,
    },
    artifacts: new Map(),
    warnings: [],
  };
}

export async function processSalesbrainRunById(runId: string): Promise<void> {
  const admin = createAdminClient();
  const loaded = await admin.schema("app").rpc("sb_worker_get_run", { p_run_id: runId });
  const row = loaded.data as RunRow | null;
  if (!row || row.deleted_at || row.status === "cancelled") return;

  const ctx = buildContext(row);
  const warnings: string[] = [];

  if (!ctx.pinned.lat || !ctx.pinned.lng || (Math.abs(ctx.pinned.lat) < 0.01 && Math.abs(ctx.pinned.lng) < 0.01)) {
    const center = await geocodePlaceLabel(ctx.pinned.locationLabel);
    if (center) {
      ctx.pinned.lat = center.lat;
      ctx.pinned.lng = center.lng;
    } else {
      warnings.push("Geen geldige kaartcoördinaten — stel NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in op de server.");
    }
  }

  if (!process.env.TAVILY_API_KEY?.trim() && !process.env.SERPER_API_KEY?.trim()) {
    warnings.push("Geen TAVILY_API_KEY of SERPER_API_KEY — zoeknodes leveren geen resultaten.");
  }

  const graph = row.graph;
  if (!graph?.nodes?.length) {
    await updateSbProgress(admin, runId, "failed", { phase: "failed", message: "Lege workflow-graph" }, {
      errorMessage: "Workflow heeft geen nodes. Publiceer opnieuw vanuit de editor.",
    });
    return;
  }

  const order = topoSort(graph.nodes, graph.edges);
  let searchHits: SearchHitArtifact[] = [];
  let jobSignals: JobSignalArtifact[] = [];
  let pageEvidence: PageEvidenceArtifact[] = [];
  const qualified: QualifiedProspectPayload[] = [];
  const insights: { title: string; summary: string; provenance: string }[] = [];

  try {
    await updateSbProgress(admin, runId, "running", { phase: "executing", message: "Workflow uitvoeren" });

    for (const node of order) {
      const check = await admin.schema("app").rpc("sb_worker_get_run", { p_run_id: runId });
      const current = check.data as RunRow | null;
      if (!current || current.deleted_at || current.status === "cancelled") return;

      await updateSbProgress(admin, runId, "running", {
        phase: node.type,
        message: node.label,
        discovered: searchHits.length + jobSignals.length,
        qualified: qualified.length,
      });

      let nodeFailed = false;
      try {
      switch (node.type) {
        case "start":
        case "client_context":
        case "documents":
          break;
        case "web_research":
          try {
            searchHits = await runWebResearchNode(ctx, node.config as { maxResults?: number });
            if (!searchHits.length) warnings.push("Live webonderzoek: geen treffers voor deze query.");
          } catch (e) {
            warnings.push(e instanceof Error ? e.message : "Webonderzoek mislukt");
            searchHits = [];
          }
          break;
        case "website_fetch":
          pageEvidence = await runWebsiteFetchNode(searchHits);
          break;
        case "job_ads":
          try {
            jobSignals = await runJobAdsNode(ctx, node.config as { maxResults?: number });
            if (!jobSignals.length) warnings.push("Vacatures zoeken: geen treffers.");
          } catch (e) {
            warnings.push(e instanceof Error ? e.message : "Vacature-zoeken mislukt");
            jobSignals = [];
          }
          break;
        case "gsc_source": {
          const obs = await runGscSourceNode(admin, ctx);
          insights.push({
            title: "Search Console",
            summary: `${obs[0]?.metric}: ${obs[0]?.value} — ${obs[0]?.note ?? ""}`,
            provenance: obs[0]?.provider ?? "gsc",
          });
          break;
        }
        case "ga4_source": {
          const obs = await runGa4SourceNode(admin, ctx);
          insights.push({
            title: "GA4",
            summary: `${obs[0]?.metric}: ${obs[0]?.value} (${obs[0]?.period})`,
            provenance: "ga4",
          });
          break;
        }
        case "trends_import": {
          const raw = String(ctx.inputs.trendsImportText ?? "");
          const obs = runTrendsImportNode(raw);
          insights.push({
            title: "Google Trends (import)",
            summary: raw.slice(0, 400) || obs[0]?.note || "Geen importdata",
            provenance: "trends_import",
          });
          break;
        }
        case "google_forms": {
          const forms = await runGoogleFormsNode(ctx);
          warnings.push(forms[0]?.note ?? "Google Forms niet geconfigureerd.");
          break;
        }
        case "normalize":
        case "verify_evidence":
        case "icp_filter":
        case "ai_analysis":
          break;
        case "results": {
          const strictGeo = Boolean(graph.nodes.find((n) => n.type === "icp_filter")?.config?.strictGeo);
          const seen = new Set<string>();
          const candidates = [...jobSignals.map((j) => ({ kind: "job" as const, j })), ...searchHits.map((h) => ({ kind: "web" as const, h }))];

          if (!candidates.length) {
            warnings.push("Geen kandidaten na zoeken — controleer API-sleutels en workflow.");
          }

          for (const item of candidates) {
            if (qualified.length >= 30) break;
            const url = item.kind === "job" ? item.j.url : item.h.url;
            const host = normalizeWebsiteHost(url);
            if (host && seen.has(host)) continue;
            if (host) seen.add(host);

            const displayName = item.kind === "job" ? item.j.companyName : item.h.title.split("|")[0]?.trim() || "Onbekend";
            let page = pageEvidence.find((p) => normalizeWebsiteHost(p.url) === host);
            if (!page && url.startsWith("http")) {
              try {
                const fetched = await safeFetchUrl(url);
                page = {
                  url,
                  finalUrl: fetched.finalUrl,
                  status: fetched.status,
                  textExcerpt: fetched.text,
                  retrievedAt: new Date().toISOString(),
                  unreachable: fetched.status < 200 || fetched.status >= 400,
                };
              } catch {
                page = undefined;
              }
            }

            const geocoded = await geocodeBusinessNearLocation(displayName, ctx.pinned.locationLabel);
            let geoVerified = false;
            let geoEligible = false;
            let distanceKm: number | null = null;
            let municipality: string | null = null;

            if (geocoded) {
              distanceKm = haversineDistanceKm(ctx.pinned.lat, ctx.pinned.lng, geocoded.lat, geocoded.lng);
              geoVerified = true;
              geoEligible = distanceKm <= ctx.pinned.radiusKm;
              municipality = geocoded.municipality;
              if (!geoEligible) {
                warnings.push(`${displayName}: buiten straal (${distanceKm.toFixed(1)} km).`);
                continue;
              }
            } else {
              warnings.push(`${displayName}: locatie niet geverifieerd.`);
              if (strictGeo) continue;
            }

            const observations: string[] = [];
            if (item.kind === "job") {
              observations.push(`Vacature-signaal: ${item.j.roleTitle}`);
              observations.push(`Advertentiestatus: ${item.j.adStatus}`);
            }
            if (page && !page.unreachable) {
              observations.push(`HTTP ${page.status} op ${page.finalUrl}`);
            } else {
              observations.push("Website niet bereikbaar tijdens inspectie.");
            }

            const ai = page?.textExcerpt
              ? await assessWithHtml({
                  goal: ctx.pinned.goalText,
                  observations,
                  htmlExcerpt: page.textExcerpt,
                  searchExcerpt: item.kind === "job" ? item.j.snippet : item.h.snippet,
                })
              : null;

            const emails = page?.textExcerpt ? extractEmailsFromHtml(page.textExcerpt) : [];
            const phones = page?.textExcerpt ? extractPhonesFromHtml(page.textExcerpt) : [];

            const limitations = ["Geen screenshot — alleen HTML-analyse."];
            if (item.kind === "job" && item.j.adStatus === "unknown") {
              limitations.push("Vacaturestatus niet bevestigd op bronpagina.");
            }

            qualified.push({
              displayName,
              websiteHost: host,
              websiteUrl: url,
              municipality,
              distanceKm,
              geoVerified,
              geoEligible,
              assessmentSummary: ai?.summary ?? observations.join("; "),
              signals: ai?.signals ?? observations.map((o) => ({ label: "Observatie", kind: "observed", detail: o })),
              limitations: [...limitations, ...(ai?.limitations ?? [])],
              evidence: [
                {
                  kind: item.kind === "job" ? "job_ad" : "web_search",
                  title: displayName,
                  url,
                  excerpt: item.kind === "job" ? item.j.snippet : item.h.snippet,
                },
                ...(page && !page.unreachable
                  ? [{ kind: "website_fetch", title: "Website", url: page.finalUrl, excerpt: page.textExcerpt.slice(0, 400) }]
                  : []),
              ],
              contacts: {
                email: emails[0] ?? null,
                phone: phones[0] ?? null,
                sourceUrl: page?.finalUrl ?? url,
              },
            });
          }
          break;
        }
        default:
          break;
      }
      await recordNodeAttempt(admin, runId, node, "completed", {
        searchHits: searchHits.length,
        jobSignals: jobSignals.length,
        qualified: qualified.length,
      });
      } catch (nodeError) {
        nodeFailed = true;
        const msg = nodeError instanceof Error ? nodeError.message : "Node mislukt";
        await recordNodeAttempt(admin, runId, node, "failed", undefined, msg);
        warnings.push(`${node.label}: ${msg}`);
      }
      if (nodeFailed && node.type === "results") {
        throw new Error("Resultaatnode mislukt");
      }
    }

    const outputKind = graph.nodes.find((n) => n.type === "results")?.config?.outputKind ?? "prospects";
    if (outputKind === "insights") {
      for (const ins of insights) {
        await admin.schema("app").rpc("sb_worker_insert_insight", {
          p_run_id: runId,
          p_title: ins.title,
          p_summary: ins.summary,
          p_provenance: ins.provenance,
        });
      }
    } else {
      let sortOrder = 0;
      for (const p of qualified) {
        sortOrder += 1;
        await admin.schema("app").rpc("sb_worker_insert_prospect", {
          p_payload: {
            runId,
            isTest: ctx.isTest,
            sortOrder,
            ...p,
          },
        });
      }
    }

    const finalStatus = warnings.length ? "completed_with_warnings" : "completed";
    await updateSbProgress(
      admin,
      runId,
      finalStatus,
      {
        phase: "done",
        message: "Analyse afgerond",
        qualified: qualified.length,
        warnings: warnings.slice(0, 10),
      },
      {
        prospectCount: outputKind === "insights" ? 0 : qualified.length,
        insightCount: insights.length,
        warnings: warnings.slice(0, 20),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Salesbrain workflow mislukt";
    await updateSbProgress(admin, runId, "failed", { phase: "failed", message }, { errorMessage: message });
  }
}
