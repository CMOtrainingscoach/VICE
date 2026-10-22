import OpenAI from "openai";
import { z } from "zod";
import { leadgenMaxResults } from "@/lib/leadgen/constants";
import { haversineDistanceKm } from "@/lib/leadgen/haversine";
import {
  extractEmailsFromHtml,
  extractPhonesFromHtml,
  findBrokenInternalLinks,
  mobileUsabilityHints,
  safeFetchUrl,
} from "@/lib/leadgen/safe-fetch";
import type { LeadgenRunProgress } from "@/lib/leadgen/types";
import { geocodeBusinessNearLocation } from "@/lib/leadgen/google-geo";
import { normalizeWebsiteHost, searchPublicWeb, type WebSearchHit } from "@/lib/leadgen/web-search";
import { resolveMeetingAnalysisModel, modelSupportsCustomTemperature } from "@/lib/openai/models";
import { createAdminClient } from "@/lib/supabase/admin";

type RunRow = {
  id: string;
  tenant_id: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  location_label: string;
  assignment_text: string;
  criteria: { maxResults?: number; signals?: string[] };
  status: string;
  deleted_at: string | null;
};

async function updateProgress(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  status: string,
  progress: LeadgenRunProgress,
  extras?: { resultCount?: number; errorMessage?: string; warnings?: string[] },
) {
  await admin.schema("app").rpc("leadgen_worker_update_progress", {
    p_run_id: runId,
    p_status: status,
    p_progress: progress,
    p_result_count: extras?.resultCount ?? null,
    p_error_message: extras?.errorMessage ?? null,
    p_warnings: extras?.warnings ? extras.warnings : null,
  });
}

function companyNameFromHit(hit: WebSearchHit): string {
  const title = hit.title.split("|")[0]?.split("-")[0]?.trim();
  return title || hit.title.slice(0, 80) || "Onbekend bedrijf";
}

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

async function assessWithAi(input: {
  assignment: string;
  signalsHint: string[];
  observations: string[];
  excerpts: string[];
}): Promise<z.infer<typeof assessmentSchema> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.VICE_LEADGEN_MODEL?.trim() || resolveMeetingAnalysisModel();
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.2 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Beoordeel website-evidence voor B2B-prospectie. Gebruik alleen meegeleverde observaties en excerpts. Geen verzonnen URLs. JSON: summary, signals[{label,kind,detail}], limitations.",
      },
      {
        role: "user",
        content: [
          `Opdracht: ${input.assignment}`,
          `Signalen om te onderzoeken: ${input.signalsHint.join(", ") || "algemeen"}`,
          "Observaties:",
          ...input.observations.map((o) => `- ${o}`),
          "Excerpts:",
          ...input.excerpts.map((e) => `- ${e.slice(0, 400)}`),
        ].join("\n"),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = assessmentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function processLeadgenRunById(runId: string): Promise<void> {
  const admin = createAdminClient();
  const loaded = await admin.schema("app").rpc("leadgen_worker_get_run", { p_run_id: runId });
  const run = loaded.data as RunRow | null;
  if (!run || run.deleted_at || run.status === "cancelled") return;

  const maxResults = Math.min(run.criteria?.maxResults ?? leadgenMaxResults(), leadgenMaxResults());
  const warnings: string[] = [];

  try {
    await updateProgress(admin, runId, "running", {
      phase: "discovering",
      message: "Bedrijven ontdekken",
      discovered: 0,
      assessed: 0,
      qualified: 0,
    });

    const query = `${run.assignment_text} ${run.location_label} bedrijven`;
    let hits: WebSearchHit[] = [];
    try {
      hits = await searchPublicWeb(query, maxResults + 5);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Zoeken mislukt";
      await updateProgress(admin, runId, "failed", { phase: "failed", message }, { errorMessage: message });
      return;
    }

    const seenHosts = new Set<string>();
    let discovered = 0;
    let assessed = 0;
    let qualified = 0;
    let sortOrder = 0;

    for (const hit of hits) {
      const current = await admin.schema("app").rpc("leadgen_worker_get_run", { p_run_id: runId });
      const row = current.data as RunRow | null;
      if (!row || row.deleted_at || row.status === "cancelled") return;

      const host = normalizeWebsiteHost(hit.url);
      if (!host || seenHosts.has(host)) continue;
      seenHosts.add(host);
      discovered += 1;

      await updateProgress(admin, runId, "running", {
        phase: "inspecting",
        message: `Website bekijken (${discovered})`,
        discovered,
        assessed,
        qualified,
      });

      let fetchOk = false;
      let observations: string[] = [];
      let limitations: string[] = ["Geen screenshot — alleen HTML-analyse."];
      let emails: string[] = [];
      let phones: string[] = [];
      let assessmentSummary = "";
      let signals: { label: string; kind: string; detail: string }[] = [];
      let geoEligible = false;
      let geoVerified = false;
      let distanceKm: number | null = null;

      try {
        const fetched = await safeFetchUrl(hit.url);
        fetchOk = fetched.status >= 200 && fetched.status < 400;
        if (!fetchOk) {
          limitations.push(`Website niet bereikbaar (HTTP ${fetched.status}).`);
        } else {
          observations.push(...mobileUsabilityHints(fetched.text));
          const broken = findBrokenInternalLinks(fetched.text, fetched.finalUrl);
          if (broken.length) observations.push(`${broken.length} interne links mogelijk problematisch`);
          emails = extractEmailsFromHtml(fetched.text);
          phones = extractPhonesFromHtml(fetched.text);
        }
      } catch (error) {
        limitations.push(error instanceof Error ? error.message : "Fetch mislukt");
      }

      assessed += 1;

      const ai = fetchOk
        ? await assessWithAi({
            assignment: run.assignment_text,
            signalsHint: run.criteria?.signals ?? [],
            observations,
            excerpts: [hit.snippet, hit.title],
          })
        : null;

      if (ai) {
        assessmentSummary = ai.summary;
        signals = ai.signals;
        limitations = [...limitations, ...ai.limitations];
      } else if (fetchOk) {
        assessmentSummary = observations.length
          ? `Observaties: ${observations.join("; ")}`
          : "Geen duidelijke signalen gevonden in de beschikbare HTML.";
        signals = observations.map((o) => ({ label: "Observatie", kind: "observed", detail: o }));
      } else {
        assessmentSummary = "Unable to assess — website niet bereikbaar.";
      }

      const locFragment = run.location_label.split(",")[0]?.trim() ?? "";
      const companyName = companyNameFromHit(hit);
      let municipality = locFragment;
      let prospectLat: number | null = null;
      let prospectLng: number | null = null;
      let locationConfidence = "unknown";

      const geocoded = await geocodeBusinessNearLocation(companyName, run.location_label);
      if (geocoded) {
        prospectLat = geocoded.lat;
        prospectLng = geocoded.lng;
        distanceKm = haversineDistanceKm(run.center_lat, run.center_lng, geocoded.lat, geocoded.lng);
        geoVerified = true;
        geoEligible = distanceKm <= run.radius_km;
        municipality = geocoded.municipality ?? locFragment;
        locationConfidence = "geocoded";
        if (!geoEligible) {
          warnings.push(`${companyName}: buiten straal (${distanceKm.toFixed(1)} km).`);
          continue;
        }
      } else {
        const snippet = `${hit.snippet} ${hit.title}`.toLowerCase();
        const cityToken = locFragment.split(" ")[0]?.toLowerCase() ?? "";
        const regionalHint =
          (cityToken && snippet.includes(cityToken)) ||
          snippet.includes("belgi") ||
          snippet.includes("belgium") ||
          host.endsWith(".be");
        if (!regionalHint) {
          warnings.push(`${companyName}: locatie niet geverifieerd — overgeslagen.`);
          continue;
        }
        geoVerified = false;
        geoEligible = true;
        distanceKm = null;
        limitations.push("Locatie niet geverifieerd — geen geocoding beschikbaar.");
      }

      qualified += 1;
      sortOrder += 1;

      await admin.schema("app").rpc("leadgen_worker_insert_result", {
        p_payload: {
          runId,
          displayName: companyName,
          websiteHost: host,
          websiteUrl: hit.url,
          municipality,
          addressText: geocoded?.formattedAddress ?? "",
          lat: prospectLat,
          lng: prospectLng,
          locationConfidence,
          geoEligible,
          geoVerified,
          distanceKm,
          assessmentSummary,
          signals,
          limitations,
          assessedAt: new Date().toISOString(),
          sortOrder,
          evidence: [
            {
              kind: "web_search",
              title: hit.title,
              url: hit.url,
              excerpt: hit.snippet,
            },
          ],
          contacts: {
            email: emails[0] ?? null,
            phone: phones[0] ?? null,
            contactPageUrl: null,
            sourceUrl: hit.url,
          },
        },
      });

      if (qualified >= maxResults) break;
    }

    const finalStatus = warnings.length ? "completed_with_warnings" : "completed";
    await updateProgress(
      admin,
      runId,
      finalStatus,
      {
        phase: "done",
        message: "Zoektocht afgerond",
        discovered,
        assessed,
        qualified,
        warnings: warnings.slice(0, 10),
      },
      { resultCount: qualified, warnings: warnings.slice(0, 20) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline mislukt";
    await updateProgress(admin, runId, "failed", { phase: "failed", message }, { errorMessage: message });
  }
}

export async function processNextQueuedLeadgenRun(): Promise<boolean> {
  const admin = createAdminClient();
  const claimed = await admin.schema("app").rpc("leadgen_worker_claim_run");
  const run = claimed.data as RunRow | null;
  if (!run?.id) return false;
  await processLeadgenRunById(run.id);
  return true;
}
