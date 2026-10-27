import { notFound, redirect } from "next/navigation";
import { SalesbrainRunWorkspace } from "@/components/salesbrain/salesbrain-run-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { canAccessTenant } from "@/lib/auth/tenant-access";
import { salesbrainEnabled } from "@/lib/salesbrain/flags";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { ensureSbWorkerAction, getSbRunAction, listSbProspectsAction } from "@/modules/salesbrain/actions";

export const maxDuration = 300;

export default async function SalesbrainRunPage({
  params,
}: {
  params: Promise<{ tenantId: string; runId: string }>;
}) {
  const { tenantId, runId } = await params;
  if (!salesbrainEnabled()) redirect(`/klanten/${tenantId}/leadgen`);
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!canAccessTenant(ctx, tenantId)) redirect("/");

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const [runResult, prospectsResult] = await Promise.all([getSbRunAction(runId), listSbProspectsAction(runId)]);

  if (!runResult.ok || !runResult.data) notFound();

  if (runResult.data.status === "queued") {
    void ensureSbWorkerAction(runId);
  }

  return (
    <SalesbrainRunWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initialRun={runResult.data}
      initialProspects={prospectsResult.ok ? prospectsResult.data ?? [] : []}
    />
  );
}
