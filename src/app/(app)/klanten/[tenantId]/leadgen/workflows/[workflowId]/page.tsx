import { notFound, redirect } from "next/navigation";
import { SalesbrainWorkflowEditor } from "@/components/salesbrain/salesbrain-workflow-editor";
import { getUserAppContext } from "@/lib/auth/context";
import { exampleFirstMarketerWorkflow } from "@/lib/salesbrain/graph/example-first-marketer";
import { salesbrainEnabled } from "@/lib/salesbrain/flags";
import { createClient } from "@/lib/supabase/server";
import { getSbWorkflowAction } from "@/modules/salesbrain/actions";

export default async function SalesbrainWorkflowEditorPage({
  params,
}: {
  params: Promise<{ tenantId: string; workflowId: string }>;
}) {
  const { tenantId, workflowId } = await params;
  if (!salesbrainEnabled()) redirect(`/klanten/${tenantId}/leadgen`);
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const wf = await getSbWorkflowAction(workflowId);
  if (!wf.ok || !wf.data) notFound();
  if (wf.data.tenantId !== tenantId) notFound();

  const graph =
    wf.data.draftGraph?.nodes?.length ? wf.data.draftGraph : exampleFirstMarketerWorkflow();

  return (
    <div className="px-4 py-4 md:px-6">
      <SalesbrainWorkflowEditor
        tenantId={tenantId}
        tenantName={tenantData.name}
        workflowId={workflowId}
        workflowTitle={wf.data.name}
        workflowPurpose={wf.data.purpose}
        initialDefinition={graph}
        readOnly={wf.data.status === "archived"}
      />
    </div>
  );
}
