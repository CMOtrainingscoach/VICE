import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PersonaWorkspace } from "@/components/persona/persona-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { STP_ROUTE } from "@/lib/persona/constants";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadPersonaWorkbenchAction } from "@/modules/persona/actions";

export const maxDuration = 300;

export default async function PersonasPage({
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

  const loaded = await loadPersonaWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <p className="text-sm text-vice-text-muted">
          <Link href={`/klanten/${tenantId}/strategie/${STP_ROUTE}`} className="hover:text-vice-gold">← STP</Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold">Persona’s konden niet laden</h1>
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {!loaded.ok ? loaded.error : "Workbench gaf geen data terug."}
        </p>
        <p className="mt-3 text-xs text-vice-text-muted">
          Pas migratie 20260330133000 toe in de Supabase SQL-editor, na 20260330132900. Eerdere migraties niet opnieuw draaien.
        </p>
      </div>
    );
  }

  return (
    <PersonaWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={loaded.data}
    />
  );
}
