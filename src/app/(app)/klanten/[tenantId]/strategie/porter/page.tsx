import { notFound, redirect } from "next/navigation";
import { PorterLoadError } from "@/components/porter/porter-load-error";
import { PorterWorkspace } from "@/components/porter/porter-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadPorterWorkbenchAction } from "@/modules/porter/actions";
import type { TenantRow } from "@/lib/types/tenant";

export default async function PorterPage({
  params,
}: PageProps<"/klanten/[tenantId]/strategie/porter">) {
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

  const loaded = await loadPorterWorkbenchAction(tenantId);
  if (!loaded.ok) {
    return <PorterLoadError tenantId={tenantId} message={loaded.error} />;
  }
  if (!loaded.data) {
    return (
      <PorterLoadError
        tenantId={tenantId}
        message="Workbench gaf geen data terug."
      />
    );
  }

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  return (
    <PorterWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={tenantName}
      initial={loaded.data}
    />
  );
}
