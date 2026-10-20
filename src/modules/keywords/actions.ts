"use server";

import { revalidatePath } from "next/cache";
import { generateKeywordIdeas, googleAdsPublicStatus } from "@/lib/integrations/google-ads";
import { generateKeywordSeedTerms } from "@/lib/keywords/seed-ai";
import type { KeywordResearchRow, KeywordResearchRun } from "@/lib/keywords/types";
import { KEYWORD_RESEARCH_MIGRATION } from "@/lib/keywords/types";
import { parseSeedTerms } from "@/lib/keywords/normalize";
import type { GscQueryRow, PeriodRows } from "@/lib/metrics/types";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { loadTenantMetricsAction } from "@/modules/metrics/actions";
import { loadStrategyDocumentAction } from "@/modules/strategy/actions";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /tenant_keyword_research|list_tenant_keyword|blog_concept_sources_kind|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? KEYWORD_RESEARCH_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function parseRun(raw: unknown): KeywordResearchRun | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  return {
    id: String(row.id),
    countryCode: String(row.countryCode ?? "BE"),
    city: String(row.city ?? ""),
    scope: row.scope === "local" ? "local" : "national",
    seedTerms: parseSeedTerms(row.seedTerms),
    language: String(row.language ?? "nl"),
    rowCount: Number(row.rowCount ?? 0),
    createdAt: String(row.createdAt ?? ""),
  };
}

function parseRows(raw: unknown): KeywordResearchRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      keyword: String(row.keyword ?? ""),
      avgMonthlySearches: Number(row.avgMonthlySearches ?? 0),
      competition: String(row.competition ?? ""),
      cpcLow: row.cpcLow != null ? Number(row.cpcLow) : null,
      cpcHigh: row.cpcHigh != null ? Number(row.cpcHigh) : null,
    };
  });
}

async function loadGscQuerySeeds(tenantId: string): Promise<string[]> {
  const metrics = await loadTenantMetricsAction(tenantId);
  if (!metrics.ok || !metrics.data) return [];
  const hit = metrics.data.snapshots.find((s) => s.kind === "gsc_queries");
  if (!hit?.data) return [];
  const data = hit.data as PeriodRows<GscQueryRow>;
  return data.current.slice(0, 15).map((q) => q.query);
}

export async function suggestKeywordSeedsAction(tenantId: string): Promise<
  ActionResult<{ seeds: string[]; model: string }>
> {
  try {
    await authed();
    const supabase = await createClient();
    const { data: tenant } = await supabase
      .schema("app")
      .from("my_tenants")
      .select("name, website, audit_goal, language")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) return { ok: false, error: "Klant niet gevonden" };

    const brand = await loadBlogBrandContextAction(tenantId);
    const strategy = await loadStrategyDocumentAction(tenantId);
    const gscQueries = await loadGscQuerySeeds(tenantId);

    const auditContext =
      strategy.ok && strategy.data?.markdown
        ? strategy.data.markdown.slice(0, 6000)
        : "";

    const generated = await generateKeywordSeedTerms({
      tenantName: String((tenant as { name: string }).name),
      website: String((tenant as { website?: string }).website ?? ""),
      auditGoal: String((tenant as { audit_goal?: string }).audit_goal ?? ""),
      auditContext,
      brandName: brand.ok && brand.data ? brand.data.brandName : "",
      brandVoice: brand.ok && brand.data ? brand.data.voice : "",
      gscQueries,
      language: String((tenant as { language?: string }).language ?? "nl"),
    });

    return { ok: true, data: generated };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Seeds genereren mislukt" };
  }
}

export async function runKeywordResearchAction(
  tenantId: string,
  input: {
    countryCode: "BE" | "NL";
    scope: "national" | "local";
    city?: string;
    seeds: string[];
    language?: string;
  },
): Promise<ActionResult<{ run: KeywordResearchRun; rows: KeywordResearchRow[] }>> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);

    if (!googleAdsPublicStatus().configured) {
      return {
        ok: false,
        error:
          "Google Ads is niet geconfigureerd. Zet GOOGLE_CLIENT_ID/SECRET, GOOGLE_ADS_CUSTOMER_ID en GOOGLE_ADS_REFRESH_TOKEN; schakel de Google Ads API in je Cloud-project in.",
      };
    }

    const seeds = parseSeedTerms(input.seeds);
    if (seeds.length === 0) return { ok: false, error: "Voeg minstens één seed-term toe." };
    if (input.scope === "local" && !input.city?.trim()) {
      return { ok: false, error: "Kies een stad voor lokaal onderzoek." };
    }

    const supabase = await createClient();
    const { data: tenant } = await supabase
      .schema("app")
      .from("my_tenants")
      .select("website, language")
      .eq("id", tenantId)
      .maybeSingle();

    const ideas = await generateKeywordIdeas({
      seeds,
      countryCode: input.countryCode,
      city: input.scope === "local" ? input.city : null,
      language: input.language ?? String((tenant as { language?: string })?.language ?? "nl"),
      siteUrl: (tenant as { website?: string })?.website ?? null,
      limit: 300,
    });

    const admin = createAdminClient();
    const { data: runRow, error: runError } = await admin
      .schema("app")
      .from("tenant_keyword_research_runs")
      .insert({
        tenant_id: tenantId,
        country_code: input.countryCode,
        city: input.scope === "local" ? String(input.city ?? "").trim() : "",
        scope: input.scope,
        seed_terms: seeds,
        language: input.language ?? "nl",
        seed_model: "",
        row_count: ideas.length,
        created_by: session.userId,
      })
      .select("id, country_code, city, scope, seed_terms, language, row_count, created_at")
      .single();

    if (runError || !runRow) {
      return { ok: false, error: migration(runError?.message ?? "Run opslaan mislukt") };
    }

    const runId = String((runRow as { id: string }).id);
    if (ideas.length > 0) {
      const { error: rowsError } = await admin.schema("app").from("tenant_keyword_research_rows").insert(
        ideas.map((idea) => ({
          run_id: runId,
          tenant_id: tenantId,
          keyword: idea.keyword,
          avg_monthly_searches: idea.avgMonthlySearches,
          competition: idea.competition,
          cpc_low: idea.cpcLow,
          cpc_high: idea.cpcHigh,
        })),
      );
      if (rowsError) {
        return { ok: false, error: migration(rowsError.message) };
      }
    }

    revalidatePath(`/klanten/${tenantId}/strategie`);
    revalidatePath(`/klanten/${tenantId}/content`);

    const run = parseRun({
      id: runRow.id,
      countryCode: runRow.country_code,
      city: runRow.city,
      scope: runRow.scope,
      seedTerms: runRow.seed_terms,
      language: runRow.language,
      rowCount: runRow.row_count,
      createdAt: runRow.created_at,
    });

    return {
      ok: true,
      data: {
        run: run!,
        rows: ideas.map((idea, index) => ({
          id: `${runId}-${index}`,
          keyword: idea.keyword,
          avgMonthlySearches: idea.avgMonthlySearches,
          competition: idea.competition,
          cpcLow: idea.cpcLow,
          cpcHigh: idea.cpcHigh,
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Keywordonderzoek mislukt" };
  }
}

export async function listKeywordResearchAction(
  tenantId: string,
  options?: { minVolume?: number; limit?: number; runId?: string },
): Promise<ActionResult<{ run: KeywordResearchRun | null; rows: KeywordResearchRow[] }>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("list_tenant_keyword_research", {
    p_tenant_id: tenantId,
    p_min_volume: options?.minVolume ?? 0,
    p_limit: options?.limit ?? 200,
    p_run_id: options?.runId ?? null,
  });
  if (result.error) return { ok: false, error: migration(result.error.message) };

  const root = result.data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      run: parseRun(root.run),
      rows: parseRows(root.rows),
    },
  };
}
