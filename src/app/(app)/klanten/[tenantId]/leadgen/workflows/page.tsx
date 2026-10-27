import { notFound, redirect } from "next/navigation";
import { SalesbrainWorkflowsList } from "@/components/salesbrain/salesbrain-workflows-list";
import { getUserAppContext } from "@/lib/auth/context";
import { salesbrainEnabled } from "@/lib/salesbrain/flags";
import { createClient } from "@/lib/supabase/server";
import { listSbWorkflowsAction } from "@/modules/salesbrain/actions";

export default async function SalesbrainWorkflowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { tenantId } = await params;
  const { archived } = await searchParams;
  if (!salesbrainEnabled()) redirect(`/klanten/${tenantId}/leadgen`);
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const includeArchived = archived === "1" || archived === "true";
  const workflows = await listSbWorkflowsAction(tenantId, { includeArchived });

  return (
    <SalesbrainWorkflowsList
      tenantId={tenantId}
      tenantName={tenantData.name}
      workflows={workflows.ok ? workflows.data ?? [] : []}
      showArchived={includeArchived}
    />
  );
}
