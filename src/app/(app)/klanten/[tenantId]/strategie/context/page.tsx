import { notFound, redirect } from "next/navigation";
import { ContextFileWorkspace } from "@/components/audit/context-file-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadContextEditorAction } from "@/modules/audit/context-actions";

export default async function ContextFilePage({
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

  const loaded = await loadContextEditorAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <h1 className="text-xl font-semibold">Contextbestand kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{loaded.ok ? "Geen gegevens." : loaded.error}</p>
      </div>
    );
  }

  return (
    <ContextFileWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={loaded.data}
    />
  );
}
