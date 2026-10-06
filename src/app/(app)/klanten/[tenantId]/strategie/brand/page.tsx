import { notFound, redirect } from "next/navigation";
import { BrandWorkspace } from "@/components/brand/brand-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { BRAND_MIGRATION } from "@/lib/brand/constants";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadAuditContextAction } from "@/modules/audit/context-actions";
import { loadBrandWorkbenchAction } from "@/modules/brand/actions";

export const maxDuration = 300;

export default async function BrandPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const loaded = await loadBrandWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <h1 className="text-xl font-semibold">Brand audit kon niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {!loaded.ok ? loaded.error : "Workbench gaf geen data terug."}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">{BRAND_MIGRATION} Eerdere migraties niet opnieuw draaien.</p>
      </div>
    );
  }

  const context = await loadAuditContextAction(tenantId);

  return (
    <BrandWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={loaded.data}
      initialContext={context.ok ? context.data ?? null : null}
    />
  );
}
