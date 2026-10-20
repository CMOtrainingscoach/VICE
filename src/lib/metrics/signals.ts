import { deltaPercent, periodRanges, sumDailyMetrics } from "@/lib/metrics/analyze";
import type { MetricDailyRow, MetricOverviewTenant } from "@/lib/metrics/types";

export type MetricAlert = {
  tenantId: string;
  tenantName: string;
  severity: "warning" | "error";
  message: string;
  href: string;
};

function expandOverviewDaily(
  daily: Pick<MetricDailyRow, "date" | "gscClicks" | "gaSessions" | "gaKeyEvents">[],
): MetricDailyRow[] {
  return daily.map((row) => ({
    date: row.date,
    gscClicks: row.gscClicks,
    gscImpressions: 0,
    gscCtr: 0,
    gscPosition: 0,
    gaSessions: row.gaSessions,
    gaUsers: 0,
    gaKeyEvents: row.gaKeyEvents,
  }));
}

export function buildMetricAlerts(tenant: MetricOverviewTenant): MetricAlert[] {
  const alerts: MetricAlert[] = [];
  const periods = periodRanges();
  const daily = expandOverviewDaily(tenant.daily);

  if (tenant.gscLastError) {
    alerts.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      severity: "error",
      message: `Search Console: ${tenant.gscLastError}`,
      href: `/klanten/${tenant.tenantId}?tab=instellingen`,
    });
  }
  if (tenant.gaLastError) {
    alerts.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      severity: "error",
      message: `Analytics: ${tenant.gaLastError}`,
      href: `/klanten/${tenant.tenantId}?tab=instellingen`,
    });
  }

  const current = sumDailyMetrics(daily, periods.current.start, periods.current.end);
  const previous = sumDailyMetrics(daily, periods.previous.start, periods.previous.end);
  const clicksDelta = deltaPercent(current.gscClicks, previous.gscClicks);
  const sessionsDelta = deltaPercent(current.gaSessions, previous.gaSessions);

  if (clicksDelta != null && clicksDelta <= -30) {
    alerts.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      severity: "warning",
      message: `Organische clicks −${Math.abs(Math.round(clicksDelta))}% (28d)`,
      href: `/klanten/${tenant.tenantId}/strategie?tab=cijfers`,
    });
  }
  if (sessionsDelta != null && sessionsDelta <= -30) {
    alerts.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      severity: "warning",
      message: `Sessies −${Math.abs(Math.round(sessionsDelta))}% (28d)`,
      href: `/klanten/${tenant.tenantId}/strategie?tab=cijfers`,
    });
  }

  const keyDelta = deltaPercent(current.gaKeyEvents, previous.gaKeyEvents);
  if (keyDelta != null && keyDelta <= -30 && previous.gaKeyEvents >= 5) {
    alerts.push({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      severity: "warning",
      message: `Key events −${Math.abs(Math.round(keyDelta))}% (28d)`,
      href: `/klanten/${tenant.tenantId}/strategie?tab=cijfers`,
    });
  }

  return alerts;
}

export function tenant28dSummary(
  daily: Pick<MetricDailyRow, "date" | "gscClicks" | "gaSessions" | "gaKeyEvents">[],
) {
  const periods = periodRanges();
  const rows = expandOverviewDaily(daily);
  const current = sumDailyMetrics(rows, periods.current.start, periods.current.end);
  const previous = sumDailyMetrics(rows, periods.previous.start, periods.previous.end);
  return {
    gscClicks: current.gscClicks,
    gaSessions: current.gaSessions,
    clicksDelta: deltaPercent(current.gscClicks, previous.gscClicks),
    sessionsDelta: deltaPercent(current.gaSessions, previous.gaSessions),
  };
}
