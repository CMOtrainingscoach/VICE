import { notFound, redirect } from "next/navigation";
import { MetricsWorkspace } from "@/components/metrics/metrics-workspace";
import { StrategyAuditTabs, type StrategyAuditTab } from "@/components/strategy/strategy-audit-tabs";
import { StrategyDocumentWorkspace } from "@/components/strategy/strategy-document-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { parseGoogleAnalyticsPublic } from "@/lib/integrations/google-analytics";
import { parseSearchConsolePublic } from "@/lib/integrations/search-console";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { loadTenantMetricsAction } from "@/modules/metrics/actions";
import { loadStrategyDocumentAction } from "@/modules/strategy/actions";

export const maxDuration = 300;

function parseTab(raw: string | undefined): StrategyAuditTab {
  return raw === "cijfers" ? "cijfers" : "document";
}

export default async function StrategyDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenantId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantData) notFound();

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  const [gscRpc, gaRpc] = await Promise.all([
    supabase.schema("app").rpc("get_tenant_integration_public", {
      p_tenant_id: tenantId,
      p_provider: "search_console",
    }),
    supabase.schema("app").rpc("get_tenant_integration_public", {
      p_tenant_id: tenantId,
      p_provider: "google_analytics",
    }),
  ]);

  const searchConsole = parseSearchConsolePublic(gscRpc.data);
  const googleAnalytics = parseGoogleAnalyticsPublic(gaRpc.data);

  if (tab === "cijfers") {
    const [metrics, brand] = await Promise.all([
      loadTenantMetricsAction(tenantId),
      loadBlogBrandContextAction(tenantId),
    ]);
    const brandName = brand.ok && brand.data ? brand.data.brandName : "";

    return (
      <div className="mx-auto max-w-6xl px-6 pt-8 md:px-10">
        <StrategyAuditTabs tenantId={tenantId} tab={tab} />
        {!metrics.ok ? (
          <div className="py-6">
            <h1 className="text-xl font-semibold">Cijfers laden mislukt</h1>
            <p className="mt-3 text-sm text-red-700 dark:text-red-300">{metrics.error}</p>
          </div>
        ) : (
          <MetricsWorkspace
            key={metrics.data?.lastFetchedAt ?? "empty"}
            tenantId={tenantId}
            tenantName={tenantName}
            brandName={brandName}
            initial={metrics.data ?? null}
            searchConsole={searchConsole}
            googleAnalytics={googleAnalytics}
          />
        )}
      </div>
    );
  }

  const loaded = await loadStrategyDocumentAction(tenantId);
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <h1 className="text-xl font-semibold">Strategische audit kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{loaded.error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-5xl px-6 pt-8 md:px-10">
        <StrategyAuditTabs tenantId={tenantId} tab={tab} />
      </div>
      <StrategyDocumentWorkspace
        tenantId={tenantId}
        tenantName={tenantName}
        initial={loaded.data ?? null}
      />
    </div>
  );
}
