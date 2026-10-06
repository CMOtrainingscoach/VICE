import { notFound, redirect } from "next/navigation";
import { ValueChainWorkspace } from "@/components/value-chain/value-chain-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadValueChainWorkbenchAction } from "@/modules/value-chain/actions";

export const maxDuration = 300;

export default async function ValueChainPage({
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

  const loaded = await loadValueChainWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <h1 className="text-xl font-semibold">Waardeketen kon niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {!loaded.ok ? loaded.error : "Workbench gaf geen data terug."}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">
          Controleer of migratie 20260330132300_value_chain_analysis.sql op Supabase is toegepast (na 322).
        </p>
      </div>
    );
  }

  const { data: bcgData, error: bcgError } = await supabase.schema("app").rpc("get_bcg_context", { p_tenant_id: tenantId });
  const bcg = !bcgError && bcgData && typeof bcgData === "object" ? (bcgData as { approved: boolean; qualitative?: boolean; items?: { title: string; quadrant: string | null; placeable: boolean }[] }) : null;

  return (
    <ValueChainWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={loaded.data}
      bcg={bcg}
    />
  );
}
