import type { SupabaseClient } from "@supabase/supabase-js";
import { formatIsoDate, periodRanges } from "@/lib/metrics/analyze";
import type { GscPageRow, GscQueryRow, MetricSnapshotKind } from "@/lib/metrics/types";
import { runGaReport } from "@/lib/integrations/google-analytics";
import {
  inspectSearchConsoleUrl,
  querySearchAnalytics,
} from "@/lib/integrations/search-console";
import {
  ensureTenantIntegrationAccessTokenAdmin,
  setIntegrationLastErrorAdmin,
} from "@/modules/integrations/tenant-integration-access";

type IntegrationMeta = {
  provider: string;
  metadata: Record<string, unknown>;
};

function mapGscQueryRows(rows: Awaited<ReturnType<typeof querySearchAnalytics>>): GscQueryRow[] {
  return rows.map((row) => ({
    query: row.keys[0] ?? "",
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

function mapGscPageRows(rows: Awaited<ReturnType<typeof querySearchAnalytics>>): GscPageRow[] {
  return rows.map((row) => ({
    page: row.keys[0] ?? "",
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

async function upsertSnapshot(
  admin: SupabaseClient,
  tenantId: string,
  kind: MetricSnapshotKind,
  data: unknown,
  periodStart: string,
  periodEnd: string,
) {
  const { error } = await admin.schema("app").from("tenant_metric_snapshots").upsert(
    {
      tenant_id: tenantId,
      kind,
      data,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,kind" },
  );
  if (error) throw new Error(error.message);
}

async function upsertDailyRow(
  admin: SupabaseClient,
  tenantId: string,
  date: string,
  patch: Partial<{
    gsc_clicks: number;
    gsc_impressions: number;
    gsc_ctr: number;
    gsc_position: number;
    ga_sessions: number;
    ga_users: number;
    ga_key_events: number;
  }>,
) {
  const { data: existing } = await admin
    .schema("app")
    .from("tenant_metric_daily")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("date", date)
    .maybeSingle();

  const row = (existing ?? {}) as Record<string, number | string>;
  const merged = {
    tenant_id: tenantId,
    date,
    gsc_clicks: patch.gsc_clicks ?? Number(row.gsc_clicks ?? 0),
    gsc_impressions: patch.gsc_impressions ?? Number(row.gsc_impressions ?? 0),
    gsc_ctr: patch.gsc_ctr ?? Number(row.gsc_ctr ?? 0),
    gsc_position: patch.gsc_position ?? Number(row.gsc_position ?? 0),
    ga_sessions: patch.ga_sessions ?? Number(row.ga_sessions ?? 0),
    ga_users: patch.ga_users ?? Number(row.ga_users ?? 0),
    ga_key_events: patch.ga_key_events ?? Number(row.ga_key_events ?? 0),
  };

  const { error } = await admin.schema("app").from("tenant_metric_daily").upsert(merged, {
    onConflict: "tenant_id,date",
  });
  if (error) throw new Error(error.message);
}

export async function syncTenantMetrics(
  admin: SupabaseClient,
  tenantId: string,
  integrations: IntegrationMeta[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const periods = periodRanges();
  const errors: string[] = [];

  const gsc = integrations.find((i) => i.provider === "search_console");
  const ga = integrations.find((i) => i.provider === "google_analytics");
  const siteUrl = gsc?.metadata?.siteUrl ? String(gsc.metadata.siteUrl) : "";
  const propertyId = ga?.metadata?.propertyId ? String(ga.metadata.propertyId) : "";

  if (siteUrl) {
    try {
      const token = await ensureTenantIntegrationAccessTokenAdmin(
        admin,
        tenantId,
        "search_console",
      );
      const [currentQ, previousQ, currentP, previousP, dailyRows] = await Promise.all([
        querySearchAnalytics(token, siteUrl, {
          startDate: periods.current.start,
          endDate: periods.current.end,
          dimensions: ["query"],
          rowLimit: 1000,
        }),
        querySearchAnalytics(token, siteUrl, {
          startDate: periods.previous.start,
          endDate: periods.previous.end,
          dimensions: ["query"],
          rowLimit: 1000,
        }),
        querySearchAnalytics(token, siteUrl, {
          startDate: periods.current.start,
          endDate: periods.current.end,
          dimensions: ["page"],
          rowLimit: 500,
        }),
        querySearchAnalytics(token, siteUrl, {
          startDate: periods.previous.start,
          endDate: periods.previous.end,
          dimensions: ["page"],
          rowLimit: 500,
        }),
        querySearchAnalytics(token, siteUrl, {
          startDate: formatIsoDate(new Date(Date.now() - 93 * 86400000)),
          endDate: periods.current.end,
          dimensions: ["date"],
          rowLimit: 1000,
        }),
      ]);

      await upsertSnapshot(
        admin,
        tenantId,
        "gsc_queries",
        { current: mapGscQueryRows(currentQ), previous: mapGscQueryRows(previousQ) },
        periods.current.start,
        periods.current.end,
      );
      await upsertSnapshot(
        admin,
        tenantId,
        "gsc_pages",
        { current: mapGscPageRows(currentP), previous: mapGscPageRows(previousP) },
        periods.current.start,
        periods.current.end,
      );

      for (const row of dailyRows) {
        const date = row.keys[0];
        if (!date) continue;
        await upsertDailyRow(admin, tenantId, date, {
          gsc_clicks: row.clicks,
          gsc_impressions: row.impressions,
          gsc_ctr: row.ctr,
          gsc_position: row.position,
        });
      }

      const { data: published } = await admin
        .schema("app")
        .from("blog_concepts")
        .select("published_url")
        .eq("tenant_id", tenantId)
        .neq("published_url", "")
        .order("published_at", { ascending: false })
        .limit(20);

      const inspections: { url: string; verdict: string; coverageState: string; indexingState: string }[] =
        [];
      for (const concept of published ?? []) {
        const url = String((concept as { published_url?: string }).published_url ?? "");
        if (!url) continue;
        try {
          const result = await inspectSearchConsoleUrl(token, siteUrl, url);
          inspections.push({ url, ...result });
        } catch {
          inspections.push({
            url,
            verdict: "ERROR",
            coverageState: "",
            indexingState: "",
          });
        }
      }
      await upsertSnapshot(admin, tenantId, "url_inspection", { items: inspections }, periods.current.start, periods.current.end);
      await setIntegrationLastErrorAdmin(admin, tenantId, "search_console", "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "GSC-sync mislukt";
      errors.push(message);
      await setIntegrationLastErrorAdmin(admin, tenantId, "search_console", message);
    }
  }

  if (propertyId) {
    try {
      const token = await ensureTenantIntegrationAccessTokenAdmin(
        admin,
        tenantId,
        "google_analytics",
      );
      const dailyGa = await runGaReport(token, propertyId, {
        dateRanges: [
          {
            startDate: formatIsoDate(new Date(Date.now() - 93 * 86400000)),
            endDate: periods.current.end,
          },
        ],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }],
        limit: 1000,
      });
      for (const row of dailyGa) {
        const date = row.dimensionValues[0];
        if (!date) continue;
        await upsertDailyRow(admin, tenantId, date, {
          ga_sessions: row.metricValues[0] ?? 0,
          ga_users: row.metricValues[1] ?? 0,
          ga_key_events: row.metricValues[2] ?? 0,
        });
      }

      const channelReport = async (start: string, end: string) =>
        runGaReport(token, propertyId, {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }],
          metrics: [{ name: "sessions" }],
          limit: 200,
        });

      const landingReport = async (start: string, end: string) =>
        runGaReport(token, propertyId, {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }],
          limit: 200,
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        });

      const audienceReport = async (start: string, end: string) =>
        runGaReport(token, propertyId, {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: "deviceCategory" }, { name: "country" }],
          metrics: [{ name: "sessions" }],
          limit: 200,
        });

      const [channelsCur, channelsPrev, landingCur, landingPrev, audienceCur] = await Promise.all([
        channelReport(periods.current.start, periods.current.end),
        channelReport(periods.previous.start, periods.previous.end),
        landingReport(periods.current.start, periods.current.end),
        landingReport(periods.previous.start, periods.previous.end),
        audienceReport(periods.current.start, periods.current.end),
      ]);

      await upsertSnapshot(
        admin,
        tenantId,
        "ga_channels",
        { current: channelsCur, previous: channelsPrev },
        periods.current.start,
        periods.current.end,
      );
      await upsertSnapshot(
        admin,
        tenantId,
        "ga_landing_pages",
        { current: landingCur, previous: landingPrev },
        periods.current.start,
        periods.current.end,
      );
      await upsertSnapshot(
        admin,
        tenantId,
        "ga_audience",
        { current: audienceCur },
        periods.current.start,
        periods.current.end,
      );
      await setIntegrationLastErrorAdmin(admin, tenantId, "google_analytics", "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "GA-sync mislukt";
      errors.push(message);
      await setIntegrationLastErrorAdmin(admin, tenantId, "google_analytics", message);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" · ") };
  }
  return { ok: true };
}

export async function listTenantsForMetricsSync(admin: SupabaseClient): Promise<
  { tenantId: string; integrations: IntegrationMeta[] }[]
> {
  const { data, error } = await admin
    .schema("app")
    .from("tenant_integrations")
    .select("tenant_id, provider, metadata, status, refresh_token")
    .in("provider", ["search_console", "google_analytics"])
    .eq("status", "connected");

  if (error) throw new Error(error.message);

  const byTenant = new Map<string, IntegrationMeta[]>();
  for (const row of data ?? []) {
    const r = row as {
      tenant_id: string;
      provider: string;
      metadata: Record<string, unknown> | null;
      refresh_token: string;
    };
    if (!r.refresh_token) continue;
    const meta = r.metadata ?? {};
    const siteOrProperty =
      r.provider === "search_console" ? meta.siteUrl : meta.propertyId;
    if (!siteOrProperty) continue;
    const list = byTenant.get(r.tenant_id) ?? [];
    list.push({ provider: r.provider, metadata: meta });
    byTenant.set(r.tenant_id, list);
  }

  return [...byTenant.entries()].map(([tenantId, integrations]) => ({ tenantId, integrations }));
}
