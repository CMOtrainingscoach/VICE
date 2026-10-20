import type { GaReportRow } from "@/lib/integrations/google-analytics";
import type { GscPageRow, GscQueryRow, MetricDailyRow, PeriodRows } from "@/lib/metrics/types";

export function formatIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function periodRanges(reference = new Date()) {
  const end = new Date(reference);
  end.setUTCDate(end.getUTCDate() - 3);
  const currentEnd = formatIsoDate(end);
  const currentStartDate = new Date(end);
  currentStartDate.setUTCDate(currentStartDate.getUTCDate() - 27);
  const previousEndDate = new Date(currentStartDate);
  previousEndDate.setUTCDate(previousEndDate.getUTCDate() - 1);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setUTCDate(previousStartDate.getUTCDate() - 27);
  return {
    current: { start: formatIsoDate(currentStartDate), end: currentEnd },
    previous: { start: formatIsoDate(previousStartDate), end: formatIsoDate(previousEndDate) },
  };
}

export function normalizeUrlForMatch(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/$/, "") || "/";
    return `${parsed.hostname.toLowerCase()}${path}`.replace(/^www\./, "");
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, "");
  }
}

export function sumDailyMetrics(rows: MetricDailyRow[], from: string, to: string) {
  const filtered = rows.filter((row) => row.date >= from && row.date <= to);
  return filtered.reduce(
    (acc, row) => ({
      gscClicks: acc.gscClicks + row.gscClicks,
      gscImpressions: acc.gscImpressions + row.gscImpressions,
      gaSessions: acc.gaSessions + row.gaSessions,
      gaUsers: acc.gaUsers + row.gaUsers,
      gaKeyEvents: acc.gaKeyEvents + row.gaKeyEvents,
    }),
    {
      gscClicks: 0,
      gscImpressions: 0,
      gaSessions: 0,
      gaUsers: 0,
      gaKeyEvents: 0,
    },
  );
}

export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function strikingDistanceQueries(
  data: PeriodRows<GscQueryRow>,
  minImpressions = 50,
): GscQueryRow[] {
  return data.current
    .filter(
      (row) =>
        row.position >= 8
        && row.position <= 20
        && row.impressions >= minImpressions,
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
}

export function lowCtrQueries(data: PeriodRows<GscQueryRow>, minImpressions = 100): GscQueryRow[] {
  return data.current
    .filter((row) => row.impressions >= minImpressions && row.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
}

export function brandTermsFromNames(...names: string[]) {
  const terms = new Set<string>();
  for (const name of names) {
    for (const part of name.toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 3) terms.add(part);
    }
  }
  return [...terms];
}

export function splitBrandQueries(
  rows: GscQueryRow[],
  brandTerms: string[],
): { brand: GscQueryRow[]; nonBrand: GscQueryRow[] } {
  const brand: GscQueryRow[] = [];
  const nonBrand: GscQueryRow[] = [];
  for (const row of rows) {
    const q = row.query.toLowerCase();
    const isBrand = brandTerms.some((term) => q.includes(term));
    if (isBrand) brand.push(row);
    else nonBrand.push(row);
  }
  return { brand, nonBrand };
}

export function decliningPages(
  data: PeriodRows<GscPageRow>,
  minPreviousClicks = 10,
  dropRatio = 0.3,
): { page: string; previousClicks: number; currentClicks: number }[] {
  const prevMap = new Map(data.previous.map((row) => [normalizeUrlForMatch(row.page), row]));
  const out: { page: string; previousClicks: number; currentClicks: number }[] = [];
  for (const row of data.current) {
    const key = normalizeUrlForMatch(row.page);
    const prev = prevMap.get(key);
    if (!prev || prev.clicks < minPreviousClicks) continue;
    if (row.clicks <= prev.clicks * (1 - dropRatio)) {
      out.push({ page: row.page, previousClicks: prev.clicks, currentClicks: row.clicks });
    }
  }
  return out.sort((a, b) => a.currentClicks - b.currentClicks).slice(0, 20);
}

export function matchPageMetrics(
  publishedUrl: string,
  pages: GscPageRow[],
): GscPageRow | null {
  const key = normalizeUrlForMatch(publishedUrl);
  return (
    pages.find((row) => normalizeUrlForMatch(row.page) === key)
    ?? pages.find((row) => normalizeUrlForMatch(row.page).endsWith(key))
    ?? null
  );
}

export function publishedUrlPath(url: string): string {
  try {
    return new URL(url.trim()).pathname.replace(/\/$/, "") || "/";
  } catch {
    const trimmed = url.trim();
    if (trimmed.startsWith("/")) return trimmed.replace(/\/$/, "") || "/";
    return trimmed;
  }
}

export function gaLandingSessionsForUrl(publishedUrl: string, rows: GaReportRow[]): number {
  const target = publishedUrlPath(publishedUrl);
  let total = 0;
  for (const row of rows) {
    const rawPath = String(row.dimensionValues[0] ?? "").split("?")[0];
    const path = rawPath.replace(/\/$/, "") || "/";
    if (path === target || path.endsWith(target) || target.endsWith(path)) {
      total += row.metricValues[0] ?? 0;
    }
  }
  return total;
}
