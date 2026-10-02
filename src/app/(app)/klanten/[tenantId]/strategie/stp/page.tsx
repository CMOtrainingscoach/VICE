import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StpWorkspace } from "@/components/stp/stp-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import { loadStpWorkbenchAction } from "@/modules/stp/actions";

export const maxDuration = 300;

export default async function StpPage({
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

  const loaded = await loadStpWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <p className="text-sm text-vice-text-muted">
          <Link href={`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`} className="hover:text-vice-gold">← Waardeketen</Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold">STP kon niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {!loaded.ok ? loaded.error : "Workbench gaf geen data terug."}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">
          Pas migratie 20260330132800 toe in de Supabase SQL-editor, na 20260330132700. Eerdere migraties niet opnieuw draaien.
        </p>
      </div>
    );
  }

  return (
    <StpWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={loaded.data}
    />
  );
}
