import { notFound, redirect } from "next/navigation";
import { LeadgenRunWorkspace } from "@/components/leadgen/leadgen-run-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { ensureLeadgenWorkerAction, getLeadgenRunAction, listLeadgenProspectsAction } from "@/modules/leadgen/actions";

export const maxDuration = 300;

export default async function LeadgenRunPage({
  params,
}: {
  params: Promise<{ tenantId: string; runId: string }>;
}) {
  const { tenantId, runId } = await params;
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

  const [runResult, prospectsResult] = await Promise.all([
    getLeadgenRunAction(runId),
    listLeadgenProspectsAction(runId),
  ]);

  if (!runResult.ok) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Leadgen kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700">{runResult.error}</p>
      </div>
    );
  }

  if (!runResult.data) notFound();

  if (runResult.data.status === "queued") {
    void ensureLeadgenWorkerAction(runId);
  }

  return (
    <LeadgenRunWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initialRun={runResult.data}
      initialProspects={prospectsResult.ok ? prospectsResult.data ?? [] : []}
    />
  );
}
