"use server";

import { revalidatePath } from "next/cache";
import {
  decliningPages,
  gaLandingSessionsForUrl,
  lowCtrQueries,
  matchPageMetrics,
  splitBrandQueries,
  strikingDistanceQueries,
  sumDailyMetrics,
  brandTermsFromNames,
} from "@/lib/metrics/analyze";
import { generatePerformanceReport } from "@/lib/metrics/report-ai";
import { listTenantsForMetricsSync, syncTenantMetrics } from "@/lib/metrics/sync";
import type { GaReportRow } from "@/lib/integrations/google-analytics";
import type {
  GscPageRow,
  GscQueryRow,
  MetricDailyRow,
  MetricOverviewTenant,
  MetricSnapshot,
  PeriodRows,
  TenantMetricsBundle,
} from "@/lib/metrics/types";
import { METRICS_MIGRATION } from "@/lib/metrics/types";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /tenant_metric|get_tenant_metrics|list_metric_overview|mark_blog_concept|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? METRICS_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function parseSnapshots(raw: unknown): MetricSnapshot[] {
  if (!raw || typeof raw !== "object") return [];
  const snapshots = (raw as { snapshots?: unknown }).snapshots;
  if (!Array.isArray(snapshots)) return [];
  return snapshots
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      kind: String(item.kind) as MetricSnapshot["kind"],
      data: item.data,
      periodStart: String(item.periodStart ?? ""),
      periodEnd: String(item.periodEnd ?? ""),
      fetchedAt: String(item.fetchedAt ?? ""),
    }));
}

function parseDaily(raw: unknown): MetricDailyRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      date: String(item.date ?? ""),
      gscClicks: Number(item.gscClicks ?? 0),
      gscImpressions: Number(item.gscImpressions ?? 0),
      gscCtr: Number(item.gscCtr ?? 0),
      gscPosition: Number(item.gscPosition ?? 0),
      gaSessions: Number(item.gaSessions ?? 0),
      gaUsers: Number(item.gaUsers ?? 0),
      gaKeyEvents: Number(item.gaKeyEvents ?? 0),
    }));
}

function snapshotData<T>(snapshots: MetricSnapshot[], kind: MetricSnapshot["kind"]): T | null {
  const hit = snapshots.find((s) => s.kind === kind);
  return (hit?.data as T) ?? null;
}

export async function loadTenantMetricsAction(
  tenantId: string,
): Promise<ActionResult<TenantMetricsBundle>> {
  const supabase = await authed();
  const metrics = await supabase.schema("app").rpc("get_tenant_metrics", { p_tenant_id: tenantId });
  if (metrics.error) return { ok: false, error: migration(metrics.error.message) };

  const daily = await supabase.schema("app").rpc("list_tenant_metric_daily", {
    p_tenant_id: tenantId,
    p_from: null,
  });
  if (daily.error) return { ok: false, error: migration(daily.error.message) };

  const root = metrics.data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      snapshots: parseSnapshots({ snapshots: root.snapshots ?? [] }),
      lastFetchedAt: root.lastFetchedAt ? String(root.lastFetchedAt) : null,
      daily: parseDaily(daily.data),
    },
  };
}

export async function refreshTenantMetricsAction(tenantId: string): Promise<ActionResult> {
  try {
    const admin = createAdminClient();
    const { data: integrations } = await admin
      .schema("app")
      .from("tenant_integrations")
      .select("provider, metadata, status, refresh_token")
      .eq("tenant_id", tenantId)
      .in("provider", ["search_console", "google_analytics"])
      .eq("status", "connected");

    const list = (integrations ?? [])
      .filter((row) => String((row as { refresh_token?: string }).refresh_token ?? ""))
      .map((row) => ({
        provider: String((row as { provider: string }).provider),
        metadata: ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<
          string,
          unknown
        >,
      }));

    const result = await syncTenantMetrics(admin, tenantId, list);
    revalidatePath(`/klanten/${tenantId}/strategie`);
    revalidatePath(`/klanten/${tenantId}/content`);
    revalidatePath("/vandaag");
    if (!result.ok) return result;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sync mislukt" };
  }
}

export async function loadMetricOverviewAction(): Promise<ActionResult<MetricOverviewTenant[]>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("list_metric_overview");
  if (result.error) return { ok: false, error: migration(result.error.message) };
  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    ok: true,
    data: rows.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        tenantId: String(row.tenantId ?? ""),
        tenantName: String(row.tenantName ?? ""),
        lastFetchedAt: row.lastFetchedAt ? String(row.lastFetchedAt) : null,
        gscLastError: String(row.gscLastError ?? ""),
        gaLastError: String(row.gaLastError ?? ""),
        gscConnected: Boolean(row.gscConnected),
        gaConnected: Boolean(row.gaConnected),
        daily: parseDaily(row.daily).map((d) => ({
          date: d.date,
          gscClicks: d.gscClicks,
          gaSessions: d.gaSessions,
          gaKeyEvents: d.gaKeyEvents,
        })),
        snapshots: parseSnapshots({ snapshots: row.snapshots ?? [] }).map((s) => ({
          kind: s.kind,
          data: s.data,
          fetchedAt: s.fetchedAt,
        })),
      };
    }),
  };
}

export type SearchOpportunity = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  kind: "striking" | "low_ctr";
};

export type ContentPerformanceItem = {
  conceptId: string;
  title: string;
  publishedUrl: string;
  gscClicks: number;
  gscPosition: number;
  gaSessions: number;
  indexVerdict: string;
  declining: boolean;
};

export async function getContentPerformanceAction(tenantId: string): Promise<
  ActionResult<{
    opportunities: SearchOpportunity[];
    posts: ContentPerformanceItem[];
  }>
> {
  const loaded = await loadTenantMetricsAction(tenantId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.data) return { ok: false, error: "Cijfers laden mislukt" };

  const queries = snapshotData<PeriodRows<GscQueryRow>>(loaded.data.snapshots, "gsc_queries");
  const pages = snapshotData<PeriodRows<GscPageRow>>(loaded.data.snapshots, "gsc_pages");
  const landing = snapshotData<PeriodRows<GaReportRow>>(loaded.data.snapshots, "ga_landing_pages");
  const inspection = snapshotData<{ items: { url: string; verdict: string }[] }>(
    loaded.data.snapshots,
    "url_inspection",
  );

  const opportunities: SearchOpportunity[] = [];
  if (queries) {
    for (const row of strikingDistanceQueries(queries)) {
      opportunities.push({ ...row, kind: "striking" });
    }
    for (const row of lowCtrQueries(queries)) {
      opportunities.push({ ...row, kind: "low_ctr" });
    }
  }

  const supabase = await authed();
  const concepts = await supabase.schema("app").rpc("list_blog_concepts", { p_tenant_id: tenantId });
  if (concepts.error) return { ok: false, error: migration(concepts.error.message) };

  const declining = pages ? decliningPages(pages) : [];
  const posts: ContentPerformanceItem[] = [];
  for (const raw of Array.isArray(concepts.data) ? concepts.data : []) {
    const row = raw as Record<string, unknown>;
    const publishedUrl = row.publishedUrl ? String(row.publishedUrl) : "";
    if (!publishedUrl) continue;
    const page = pages ? matchPageMetrics(publishedUrl, pages.current) : null;
    const inspect = inspection?.items?.find((i) => i.url === publishedUrl);
    const isDeclining = declining.some((d) => d.page.includes(publishedUrl) || publishedUrl.includes(d.page));
    posts.push({
      conceptId: String(row.id),
      title: String(row.title ?? row.sourceText ?? "Blog"),
      publishedUrl,
      gscClicks: page?.clicks ?? 0,
      gscPosition: page?.position ?? 0,
      gaSessions: landing ? gaLandingSessionsForUrl(publishedUrl, landing.current) : 0,
      indexVerdict: inspect?.verdict ?? "UNKNOWN",
      declining: isDeclining,
    });
  }

  return { ok: true, data: { opportunities: opportunities.slice(0, 30), posts } };
}

export async function generateMonthlyReportAction(
  tenantId: string,
  periodMonth: string,
): Promise<ActionResult<{ markdown: string; model: string; periodMonth: string }>> {
  const supabase = await authed();
  const loaded = await loadTenantMetricsAction(tenantId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.data) return { ok: false, error: "Cijfers laden mislukt" };

  const brand = await loadBlogBrandContextAction(tenantId);
  if (!brand.ok || !brand.data) {
    return { ok: false, error: brand.ok ? "Merkcontext ontbreekt" : brand.error };
  }

  const month = periodMonth.slice(0, 7) + "-01";
  const monthStart = new Date(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const prevStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const prevEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 0);

  const current = sumDailyMetrics(
    loaded.data.daily,
    formatDate(monthStart),
    formatDate(monthEnd),
  );
  const previous = sumDailyMetrics(
    loaded.data.daily,
    formatDate(prevStart),
    formatDate(prevEnd),
  );

  const queries = snapshotData<PeriodRows<GscQueryRow>>(loaded.data.snapshots, "gsc_queries");
  const pages = snapshotData<PeriodRows<GscPageRow>>(loaded.data.snapshots, "gsc_pages");
  const brandSplit = queries
    ? splitBrandQueries(
        queries.current,
        brandTermsFromNames(brand.data.brandName, brand.data.tenantName),
      )
    : null;

  const facts = [
    `Periode: ${formatDate(monthStart)} t/m ${formatDate(monthEnd)}`,
    `Vorige periode: ${formatDate(prevStart)} t/m ${formatDate(prevEnd)}`,
    `GSC clicks: ${current.gscClicks} (vorig: ${previous.gscClicks})`,
    `GSC impressions: ${current.gscImpressions} (vorig: ${previous.gscImpressions})`,
    `GA sessions: ${current.gaSessions} (vorig: ${previous.gaSessions})`,
    `GA key events: ${current.gaKeyEvents} (vorig: ${previous.gaKeyEvents})`,
    brandSplit
      ? `Brand queries: ${brandSplit.brand.length}, non-brand: ${brandSplit.nonBrand.length}`
      : "",
    queries
      ? `Top queries: ${queries.current
          .slice(0, 10)
          .map((q) => q.query)
          .join(", ")}`
      : "",
    pages
      ? `Top pages: ${pages.current
          .slice(0, 10)
          .map((p) => p.page)
          .join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const generated = await generatePerformanceReport({
    tenantName: brand.data.tenantName,
    brandVoice: brand.data.voice,
    factsMarkdown: facts,
    language: "nl",
  });

  const saved = await supabase.schema("app").rpc("upsert_tenant_performance_report", {
    p_tenant_id: tenantId,
    p_period_month: month,
    p_markdown: generated.markdown,
    p_model: generated.model,
  });
  if (saved.error) return { ok: false, error: migration(saved.error.message) };

  return { ok: true, data: { ...generated, periodMonth: month } };
}

export async function listMonthlyReportsAction(tenantId: string) {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("list_tenant_performance_reports", {
    p_tenant_id: tenantId,
  });
  if (result.error) return { ok: false as const, error: migration(result.error.message) };
  return { ok: true as const, data: result.data };
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function runMetricsCronSync(): Promise<{ synced: number; errors: string[] }> {
  const admin = createAdminClient();
  const tenants = await listTenantsForMetricsSync(admin);
  const errors: string[] = [];
  let synced = 0;
  for (const tenant of tenants) {
    const result = await syncTenantMetrics(admin, tenant.tenantId, tenant.integrations);
    if (result.ok) synced += 1;
    else errors.push(`${tenant.tenantId}: ${result.error}`);
  }
  return { synced, errors };
}
