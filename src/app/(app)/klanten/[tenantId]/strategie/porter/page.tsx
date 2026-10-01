import { notFound, redirect } from "next/navigation";
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
  if (!loaded.ok || !loaded.data) {
    notFound();
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
