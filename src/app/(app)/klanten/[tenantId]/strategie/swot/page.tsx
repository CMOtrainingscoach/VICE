import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SwotWorkspace } from "@/components/swot/swot-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { MARKETING_5C_ROUTE } from "@/lib/marketing-5c/constants";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadSwotWorkbenchAction } from "@/modules/swot/actions";

export const maxDuration = 300;

export default async function SwotPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
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

  const loaded = await loadSwotWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    const message = !loaded.ok ? loaded.error : "Workbench gaf geen data terug.";
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <p className="text-sm text-vice-text-muted">
          <Link href={`/klanten/${tenantId}/strategie/${MARKETING_5C_ROUTE}`} className="hover:text-vice-gold">
            ← 5C-analyse
          </Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold">SWOT kon niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">
          Controleer of migratie 20260330132100_swot_analysis.sql op Supabase is toegepast (na 320).
        </p>
      </div>
    );
  }

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  return (
    <SwotWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={tenantName}
      initial={loaded.data}
    />
  );
}
