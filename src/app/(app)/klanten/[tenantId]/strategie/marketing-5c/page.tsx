import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FiveCWorkspace } from "@/components/marketing-5c/five-c-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadFiveCWorkbenchAction } from "@/modules/marketing-5c/actions";

/** Eén AI-call over alle bronnen kan langer duren dan de standaardlimiet. */
export const maxDuration = 300;

export default async function Marketing5CPage({
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

  const loaded = await loadFiveCWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    const message = !loaded.ok ? loaded.error : "Workbench gaf geen data terug.";
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <p className="text-sm text-vice-text-muted">
          <Link href={`/klanten/${tenantId}/strategie/porter`} className="hover:text-vice-gold">
            ← Porter
          </Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold">5C-analyse kon niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">
          Controleer of migratie 20260330132000_five_c_analysis.sql op Supabase is toegepast.
        </p>
      </div>
    );
  }

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  return (
    <FiveCWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={tenantName}
      initial={loaded.data}
    />
  );
}
