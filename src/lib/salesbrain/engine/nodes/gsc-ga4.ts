import { runGaReport } from "@/lib/integrations/google-analytics";
import { querySearchAnalytics } from "@/lib/integrations/search-console";
import { ensureTenantIntegrationAccessTokenAdmin } from "@/modules/integrations/tenant-integration-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SbExecutionContext } from "@/lib/salesbrain/engine/context";

export type MetricObservationArtifact = {
  provider: "gsc" | "ga4" | "trends_import";
  metric: string;
  value: string;
  period: string;
  filters: string;
  retrievedAt: string;
  note: string;
};

export async function runGscSourceNode(
  admin: SupabaseClient,
  ctx: SbExecutionContext,
): Promise<MetricObservationArtifact[]> {
  try {
    const accessToken = await ensureTenantIntegrationAccessTokenAdmin(admin, ctx.tenantId, "search_console");
    const { data: row } = await admin
      .schema("app")
      .from("tenant_integrations")
      .select("metadata")
      .eq("tenant_id", ctx.tenantId)
      .eq("provider", "search_console")
      .maybeSingle();
    const siteUrl = (row?.metadata as { siteUrl?: string } | null)?.siteUrl;
    if (!siteUrl) {
      return [
        {
          provider: "gsc",
          metric: "clicks",
          value: "n/a",
          period: "28d",
          filters: "no site selected",
          retrievedAt: new Date().toISOString(),
          note: "Selecteer een Search Console-property in klantintegraties.",
        },
      ];
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const rows = await querySearchAnalytics(accessToken, siteUrl, {
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["query"],
      rowLimit: 25,
    });
    const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
    const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
    return [
      {
        provider: "gsc",
        metric: "clicks",
        value: String(clicks),
        period: "28d",
        filters: `site:${siteUrl}`,
        retrievedAt: new Date().toISOString(),
        note: `${rows.length} query-rijen; ${impressions} impressies totaal.`,
      },
    ];
  } catch (error) {
    return [
      {
        provider: "gsc",
        metric: "clicks",
        value: "error",
        period: "28d",
        filters: "",
        retrievedAt: new Date().toISOString(),
        note: error instanceof Error ? error.message : "GSC ophalen mislukt",
      },
    ];
  }
}

export async function runGa4SourceNode(
  admin: SupabaseClient,
  ctx: SbExecutionContext,
): Promise<MetricObservationArtifact[]> {
  try {
    const accessToken = await ensureTenantIntegrationAccessTokenAdmin(admin, ctx.tenantId, "google_analytics");
    const { data: row } = await admin
      .schema("app")
      .from("tenant_integrations")
      .select("metadata")
      .eq("tenant_id", ctx.tenantId)
      .eq("provider", "google_analytics")
      .maybeSingle();
    const propertyId = (row?.metadata as { propertyId?: string } | null)?.propertyId;
    if (!propertyId) {
      return [
        {
          provider: "ga4",
          metric: "sessions",
          value: "n/a",
          period: "28d",
          filters: "no property selected",
          retrievedAt: new Date().toISOString(),
          note: "Selecteer een GA4-property in klantintegraties.",
        },
      ];
    }
    const rows = await runGaReport(accessToken, propertyId, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }],
      dimensions: [{ name: "date" }],
    });
    const total = rows.reduce((sum, r) => sum + Number(r.metricValues[0] ?? 0), 0);
    return [
      {
        provider: "ga4",
        metric: "sessions",
        value: String(total),
        period: "28d",
        filters: `property:${propertyId}`,
        retrievedAt: new Date().toISOString(),
        note: "Aggregate analytics — geen individuele bezoekers.",
      },
    ];
  } catch (error) {
    return [
      {
        provider: "ga4",
        metric: "sessions",
        value: "error",
        period: "28d",
        filters: "",
        retrievedAt: new Date().toISOString(),
        note: error instanceof Error ? error.message : "GA4 ophalen mislukt",
      },
    ];
  }
}

export function runTrendsImportNode(raw: string): MetricObservationArtifact[] {
  return [
    {
      provider: "trends_import",
      metric: "relative_interest",
      value: "import",
      period: "manual",
      filters: "",
      retrievedAt: new Date().toISOString(),
      note: `Handmatige import (${raw.length} tekens) — geen officiële Trends API.`,
    },
  ];
}
