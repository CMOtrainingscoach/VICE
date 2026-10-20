"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { GoogleAnalyticsPublicStatus } from "@/lib/integrations/google-analytics";
import type { SearchConsolePublicStatus } from "@/lib/integrations/search-console";
import type { GaReportRow } from "@/lib/integrations/google-analytics";
import {
  brandTermsFromNames,
  deltaPercent,
  periodRanges,
  splitBrandQueries,
  sumDailyMetrics,
} from "@/lib/metrics/analyze";
import type { GscPageRow, GscQueryRow, MetricDailyRow, PeriodRows, TenantMetricsBundle } from "@/lib/metrics/types";
import {
  generateMonthlyReportAction,
  listMonthlyReportsAction,
  refreshTenantMetricsAction,
} from "@/modules/metrics/actions";

type ReportRow = { periodMonth: string; markdown: string; model: string; createdAt: string };

export function MetricsWorkspace({
  tenantId,
  tenantName,
  brandName,
  initial,
  searchConsole,
  googleAnalytics,
}: {
  tenantId: string;
  tenantName: string;
  brandName: string;
  initial: TenantMetricsBundle | null;
  searchConsole: SearchConsolePublicStatus;
  googleAnalytics: GoogleAnalyticsPublicStatus;
}) {
  const router = useRouter();
  const bundle = initial;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportMonth, setReportMonth] = useState(defaultReportMonth());
  const [reportMarkdown, setReportMarkdown] = useState("");

  const gscReady = searchConsole.connected && Boolean(searchConsole.siteUrl);
  const gaReady = googleAnalytics.connected && Boolean(googleAnalytics.propertyId);
  const anyReady = gscReady || gaReady;

  useEffect(() => {
    void listMonthlyReportsAction(tenantId).then((result) => {
      if (!result.ok || !Array.isArray(result.data)) return;
      setReports(
        result.data.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            periodMonth: String(row.periodMonth ?? ""),
            markdown: String(row.markdown ?? ""),
            model: String(row.model ?? ""),
            createdAt: String(row.createdAt ?? ""),
          };
        }),
      );
    });
  }, [tenantId]);

  useEffect(() => {
    if (!bundle?.lastFetchedAt || busy === "refresh") return;
    const ageMs = Date.now() - new Date(bundle.lastFetchedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000 && anyReady) {
      void refresh(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-refresh once when stale
  }, []);

  const snapshots = bundle?.snapshots ?? [];
  const daily = bundle?.daily ?? [];
  const queries = snapshotData<PeriodRows<GscQueryRow>>(snapshots, "gsc_queries");
  const pages = snapshotData<PeriodRows<GscPageRow>>(snapshots, "gsc_pages");
  const channels = snapshotData<PeriodRows<GaReportRow>>(snapshots, "ga_channels");
  const landing = snapshotData<PeriodRows<GaReportRow>>(snapshots, "ga_landing_pages");
  const audience = snapshotData<{ current: GaReportRow[] }>(snapshots, "ga_audience");

  const periods = periodRanges();
  const currentTotals = sumDailyMetrics(daily, periods.current.start, periods.current.end);
  const previousTotals = sumDailyMetrics(daily, periods.previous.start, periods.previous.end);

  const brandSplit = useMemo(() => {
    if (!queries) return null;
    return splitBrandQueries(queries.current, brandTermsFromNames(brandName, tenantName));
  }, [queries, brandName, tenantName]);

  const trendPoints = useMemo(() => buildTrend(daily), [daily]);

  async function refresh(manual: boolean) {
    if (manual) setBusy("refresh");
    setError("");
    const result = await refreshTenantMetricsAction(tenantId);
    if (manual) setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function generateReport() {
    setBusy("report");
    setError("");
    const result = await generateMonthlyReportAction(tenantId, reportMonth);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Rapport genereren mislukt" : result.error);
      return;
    }
    setReportMarkdown(result.data.markdown);
    const listed = await listMonthlyReportsAction(tenantId);
    if (listed.ok && Array.isArray(listed.data)) {
      setReports(
        listed.data.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            periodMonth: String(row.periodMonth ?? ""),
            markdown: String(row.markdown ?? ""),
            model: String(row.model ?? ""),
            createdAt: String(row.createdAt ?? ""),
          };
        }),
      );
    }
  }

  const lastLabel = bundle?.lastFetchedAt
    ? new Date(bundle.lastFetchedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })
    : "Nog niet gesynchroniseerd";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">Klanten / {tenantName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-vice-text md:text-3xl">Cijfers</h1>
      <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
        Search Console en GA4 (laatste sync). Geen live-opvraging bij Google tijdens het browsen.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-vice-border bg-vice-surface px-4 py-3 text-sm">
        <StatusPill label="Search Console" ok={gscReady} detail={searchConsole.siteUrl ?? "niet gekoppeld"} />
        <StatusPill
          label="Analytics"
          ok={gaReady}
          detail={googleAnalytics.propertyName ?? googleAnalytics.propertyId ?? "niet gekoppeld"}
        />
        <span className="text-xs text-vice-text-muted" suppressHydrationWarning>
          Laatste sync: {lastLabel}
        </span>
        {!anyReady ? (
          <Button asChild variant="secondary">
            <Link href={`/klanten/${tenantId}?tab=instellingen`}>Naar instellingen</Link>
          </Button>
        ) : (
          <Button type="button" disabled={busy !== ""} onClick={() => void refresh(true)}>
            {busy === "refresh" ? "Bezig…" : "Vernieuw cijfers"}
          </Button>
        )}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {!bundle || daily.length === 0 ? (
        <p className="mt-8 text-sm text-vice-text-muted">
          {anyReady
            ? "Nog geen opgeslagen cijfers. Klik op Vernieuw cijfers om de eerste sync te starten."
            : "Koppel Search Console en/of GA4 onder Instellingen om cijfers te zien."}
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Clicks (28d)" value={currentTotals.gscClicks} delta={deltaPercent(currentTotals.gscClicks, previousTotals.gscClicks)} />
            <KpiCard label="Vertoningen (28d)" value={currentTotals.gscImpressions} delta={deltaPercent(currentTotals.gscImpressions, previousTotals.gscImpressions)} />
            <KpiCard label="Sessies (28d)" value={currentTotals.gaSessions} delta={deltaPercent(currentTotals.gaSessions, previousTotals.gaSessions)} />
            <KpiCard label="Key events (28d)" value={currentTotals.gaKeyEvents} delta={deltaPercent(currentTotals.gaKeyEvents, previousTotals.gaKeyEvents)} />
          </div>

          <section className="mt-10">
            <h2 className="text-sm font-medium text-vice-text">Trend (90 dagen)</h2>
            <TrendChart points={trendPoints} className="mt-3" />
          </section>

          {queries ? (
            <DataTable
              title="Top zoekopdrachten (28d)"
              headers={["Query", "Clicks", "Vertoningen", "CTR", "Positie"]}
              rows={queries.current.slice(0, 15).map((row) => [
                row.query,
                String(row.clicks),
                String(row.impressions),
                `${(row.ctr * 100).toFixed(1)}%`,
                row.position.toFixed(1),
              ])}
            />
          ) : null}

          {brandSplit ? (
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <DataTable
                title="Brand queries"
                headers={["Query", "Clicks", "Positie"]}
                rows={brandSplit.brand.slice(0, 10).map((row) => [row.query, String(row.clicks), row.position.toFixed(1)])}
              />
              <DataTable
                title="Non-brand queries"
                headers={["Query", "Clicks", "Positie"]}
                rows={brandSplit.nonBrand.slice(0, 10).map((row) => [row.query, String(row.clicks), row.position.toFixed(1)])}
              />
            </div>
          ) : null}

          {pages ? (
            <DataTable
              title="Top pagina's (Search Console)"
              headers={["Pagina", "Clicks", "Vertoningen", "Positie"]}
              rows={pages.current.slice(0, 15).map((row) => [
                trimUrl(row.page),
                String(row.clicks),
                String(row.impressions),
                row.position.toFixed(1),
              ])}
            />
          ) : null}

          {channels ? (
            <DataTable
              title="Kanalen (GA4)"
              headers={["Kanaal", "Bron", "Sessies"]}
              rows={channels.current.slice(0, 15).map((row) => [
                row.dimensionValues[0] ?? "",
                row.dimensionValues[1] ?? "",
                String(row.metricValues[0] ?? 0),
              ])}
            />
          ) : null}

          {landing ? (
            <DataTable
              title="Landingpagina's (GA4)"
              headers={["Pad", "Sessies"]}
              rows={landing.current.slice(0, 15).map((row) => [
                row.dimensionValues[0] ?? "",
                String(row.metricValues[0] ?? 0),
              ])}
            />
          ) : null}

          {audience?.current?.length ? (
            <DataTable
              title="Apparaat & land"
              headers={["Apparaat", "Land", "Sessies"]}
              rows={audience.current.slice(0, 15).map((row) => [
                row.dimensionValues[0] ?? "",
                row.dimensionValues[1] ?? "",
                String(row.metricValues[0] ?? 0),
              ])}
            />
          ) : null}
        </>
      )}

      <section className="mt-12 rounded-xl border border-vice-border bg-vice-surface p-5">
        <h2 className="text-sm font-medium text-vice-text">Maandrapport (AI)</h2>
        <p className="mt-1 text-xs text-vice-text-muted">
          Gebaseerd op opgeslagen dagcijfers en snapshots. Het model mag geen cijfers verzinnen buiten de feiten.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-vice-text-muted">Maand</span>
            <input
              type="month"
              className="rounded-md border border-vice-border bg-vice-surface px-2 py-1.5 text-sm"
              value={reportMonth.slice(0, 7)}
              onChange={(event) => setReportMonth(`${event.target.value}-01`)}
            />
          </label>
          <Button type="button" disabled={busy !== "" || daily.length === 0} onClick={() => void generateReport()}>
            {busy === "report" ? "Genereren…" : "Genereer rapport"}
          </Button>
          {reportMarkdown ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(reportMarkdown)}
            >
              Kopieer
            </Button>
          ) : null}
        </div>
        {reportMarkdown ? (
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-vice-border bg-vice-surface-muted/40 p-4 text-sm text-vice-text">
            {reportMarkdown}
          </pre>
        ) : null}
        {reports.length > 0 ? (
          <ul className="mt-4 divide-y divide-vice-border text-sm">
            {reports.map((row) => (
              <li key={row.periodMonth} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{row.periodMonth.slice(0, 7)}</span>
                <button
                  type="button"
                  className="text-vice-gold hover:underline"
                  onClick={() => setReportMarkdown(row.markdown)}
                >
                  Tonen
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function snapshotData<T>(snapshots: TenantMetricsBundle["snapshots"], kind: string): T | null {
  const hit = snapshots.find((s) => s.kind === kind);
  return (hit?.data as T) ?? null;
}

function defaultReportMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function trimUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-xs font-medium text-vice-text">{label}</span>
      <span className={ok ? "text-xs text-emerald-700 dark:text-emerald-400" : "text-xs text-vice-text-muted"}>
        {detail}
      </span>
    </span>
  );
}

function KpiCard({ label, value, delta }: { label: string; value: number; delta: number | null }) {
  const deltaLabel =
    delta == null ? "—" : `${delta >= 0 ? "+" : ""}${Math.round(delta)}% vs vorige 28d`;
  const deltaClass =
    delta == null ? "text-vice-text-muted" : delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400";
  return (
    <div className="rounded-xl border border-vice-border bg-vice-surface px-4 py-3">
      <p className="text-xs text-vice-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-vice-text">{value.toLocaleString("nl-BE")}</p>
      <p className={`mt-0.5 text-xs ${deltaClass}`}>{deltaLabel}</p>
    </div>
  );
}

function DataTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10 overflow-x-auto">
      <h2 className="text-sm font-medium text-vice-text">{title}</h2>
      <table className="mt-3 w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-vice-border text-left text-xs text-vice-text-muted">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-vice-border/60">
              {row.map((cell, j) => (
                <td key={j} className="max-w-xs truncate px-2 py-2 text-vice-text" title={cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type TrendPoint = { date: string; clicks: number; sessions: number };

function buildTrend(daily: MetricDailyRow[]): TrendPoint[] {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-90).map((row) => ({
    date: row.date,
    clicks: row.gscClicks,
    sessions: row.gaSessions,
  }));
}

function TrendChart({ points, className }: { points: TrendPoint[]; className?: string }) {
  if (points.length < 2) {
    return <p className={`text-sm text-vice-text-muted ${className ?? ""}`}>Nog onvoldoende dagdata voor een trend.</p>;
  }
  const w = 640;
  const h = 160;
  const pad = 8;
  const maxC = Math.max(1, ...points.map((p) => p.clicks));
  const maxS = Math.max(1, ...points.map((p) => p.sessions));
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const yC = (v: number) => h - pad - (v / maxC) * (h - pad * 2);
  const yS = (v: number) => h - pad - (v / maxS) * (h - pad * 2);
  const line = (key: "clicks" | "sessions", yFn: (v: number) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yFn(p[key]).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-full max-w-3xl text-vice-text ${className ?? ""}`} role="img" aria-label="Trend clicks en sessies">
      <path d={line("clicks", yC)} fill="none" stroke="currentColor" strokeWidth="2" className="text-vice-gold" />
      <path d={line("sessions", yS)} fill="none" stroke="currentColor" strokeWidth="2" className="text-vice-text-muted opacity-70" />
      <text x={pad} y={14} className="fill-current text-[10px] text-vice-gold">
        Clicks
      </text>
      <text x={pad + 48} y={14} className="fill-current text-[10px] text-vice-text-muted">
        Sessies
      </text>
    </svg>
  );
}
