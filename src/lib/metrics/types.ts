export type MetricSnapshotKind =
  | "gsc_queries"
  | "gsc_pages"
  | "ga_channels"
  | "ga_landing_pages"
  | "ga_audience"
  | "url_inspection";

export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type PeriodRows<T> = {
  current: T[];
  previous: T[];
};

export type MetricSnapshot = {
  kind: MetricSnapshotKind;
  data: unknown;
  periodStart: string;
  periodEnd: string;
  fetchedAt: string;
};

export type MetricDailyRow = {
  date: string;
  gscClicks: number;
  gscImpressions: number;
  gscCtr: number;
  gscPosition: number;
  gaSessions: number;
  gaUsers: number;
  gaKeyEvents: number;
};

export type TenantMetricsBundle = {
  snapshots: MetricSnapshot[];
  lastFetchedAt: string | null;
  daily: MetricDailyRow[];
};

export type MetricOverviewTenant = {
  tenantId: string;
  tenantName: string;
  lastFetchedAt: string | null;
  gscLastError: string;
  gaLastError: string;
  gscConnected: boolean;
  gaConnected: boolean;
  daily: Pick<MetricDailyRow, "date" | "gscClicks" | "gaSessions" | "gaKeyEvents">[];
  snapshots: Pick<MetricSnapshot, "kind" | "data" | "fetchedAt">[];
};

export const METRICS_MIGRATION =
  "Pas migratie 20260330135500_tenant_metrics.sql toe in de Supabase SQL-editor, na 20260330135400.";
