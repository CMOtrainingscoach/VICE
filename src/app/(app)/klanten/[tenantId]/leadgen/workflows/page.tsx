import { notFound, redirect } from "next/navigation";
import { SalesbrainWorkflowEditor } from "@/components/salesbrain/salesbrain-workflow-editor";
import { getUserAppContext } from "@/lib/auth/context";
import { salesbrainEnabled } from "@/lib/salesbrain/flags";
import { createClient } from "@/lib/supabase/server";
import { listSbWorkflowsAction } from "@/modules/salesbrain/actions";

export default async function SalesbrainWorkflowsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!salesbrainEnabled()) redirect(`/klanten/${tenantId}/leadgen`);
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  await supabase.schema("app").rpc("ensure_default_sb_workflow", { p_tenant_id: tenantId });
  const workflows = await listSbWorkflowsAction(tenantId);
  const workflowId = workflows.ok && workflows.data?.[0]?.id ? workflows.data[0].id : tenantId;

  return (
    <div className="px-4 py-6">
      <p className="text-sm text-vice-text-muted">{tenantData.name} / Salesbrain / Workflows</p>
      <SalesbrainWorkflowEditor tenantId={tenantId} workflowId={workflowId} />
    </div>
  );
}
