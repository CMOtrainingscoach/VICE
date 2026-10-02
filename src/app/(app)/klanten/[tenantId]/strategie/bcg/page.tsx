import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BcgWorkspace } from "@/components/bcg/bcg-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { VRIO_ROUTE } from "@/lib/vrio/constants";
import { loadBcgWorkbenchAction } from "@/modules/bcg/actions";

export const maxDuration = 300;

export default async function BcgPage({
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

  const loaded = await loadBcgWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <p className="text-sm text-vice-text-muted">
          <Link href={`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`} className="hover:text-vice-gold">← VRIO</Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold">BCG-matrix kon niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {!loaded.ok ? loaded.error : "Workbench gaf geen data terug."}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">
          Controleer of migraties 20260330132400, 20260330132500 en 20260330132600 op Supabase zijn toegepast (na 323).
        </p>
      </div>
    );
  }

  return (
    <BcgWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={loaded.data}
    />
  );
}
