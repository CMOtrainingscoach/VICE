import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserAppContext } from "@/lib/auth/context";
import { buildMetricAlerts, tenant28dSummary } from "@/lib/metrics/signals";
import { createClient } from "@/lib/supabase/server";
import { TENANT_STATUS_LABELS, type TenantRow } from "@/lib/types/tenant";
import { loadMetricOverviewAction } from "@/modules/metrics/actions";
import { Button } from "@/components/ui/button";

export default async function VandaagPage() {
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) {
    return (
      <div className="p-8">
        <EmptyState title="Welkom" description="Je klantomgeving opent via het menu." />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: tenants } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(8);

  const rows = (tenants ?? []) as TenantRow[];
  const overview = await loadMetricOverviewAction();
  const metricByTenant = new Map(
    overview.ok && overview.data ? overview.data.map((t) => [t.tenantId, t]) : [],
  );
  const alerts =
    overview.ok && overview.data ? overview.data.flatMap((t) => buildMetricAlerts(t)) : [];

  return (
    <div className="p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-vice-text">Vandaag</h1>
          <p className="mt-1 text-sm text-vice-text-muted">
            Overzicht van recente klantactiviteit en volgende stappen.
          </p>
        </div>
        <Button asChild>
          <Link href="/klanten/nieuw">Klant toevoegen</Link>
        </Button>
      </header>

      {alerts.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-vice-text">Signalen</h2>
          <ul className="mt-3 divide-y divide-vice-border rounded-lg border border-vice-border bg-vice-surface">
            {alerts.slice(0, 12).map((alert, index) => (
              <li key={`${alert.tenantId}-${index}`}>
                <Link
                  href={alert.href}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-vice-surface-muted/60"
                >
                  <div>
                    <p className="text-sm font-medium text-vice-text">{alert.tenantName}</p>
                    <p
                      className={
                        alert.severity === "error"
                          ? "text-sm text-red-700 dark:text-red-300"
                          : "text-sm text-amber-800 dark:text-amber-300"
                      }
                    >
                      {alert.message}
                    </p>
                  </div>
                  <span className="text-sm text-vice-gold">Bekijken →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen klanten"
          description="Voeg je eerste klant toe."
          action={
            <Button asChild>
              <Link href="/klanten/nieuw">Eerste klant aanmaken</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-vice-border rounded-lg border border-vice-border bg-vice-surface">
          {rows.map((t) => {
            const metric = metricByTenant.get(t.id);
            const summary = metric ? tenant28dSummary(metric.daily) : null;
            return (
              <li key={t.id}>
                <Link
                  href={`/klanten/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-vice-surface-muted/60"
                >
                  <div>
                    <p className="font-medium text-vice-text">{t.name}</p>
                    <p className="text-sm text-vice-text-muted">{TENANT_STATUS_LABELS[t.status]}</p>
                    {summary && (summary.gscClicks > 0 || summary.gaSessions > 0) ? (
                      <p className="mt-1 text-xs text-vice-text-muted">
                        28d: {summary.gscClicks.toLocaleString("nl-BE")} clicks
                        {summary.clicksDelta != null ? ` (${summary.clicksDelta >= 0 ? "+" : ""}${Math.round(summary.clicksDelta)}%)` : ""}
                        {" · "}
                        {summary.gaSessions.toLocaleString("nl-BE")} sessies
                        {summary.sessionsDelta != null ? ` (${summary.sessionsDelta >= 0 ? "+" : ""}${Math.round(summary.sessionsDelta)}%)` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-sm text-vice-gold">Openen →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
