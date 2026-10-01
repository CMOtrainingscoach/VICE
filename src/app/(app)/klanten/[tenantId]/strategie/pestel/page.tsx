import { notFound, redirect } from "next/navigation";
import { PestelWorkspace } from "@/components/pestel/pestel-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadPestelWorkbenchAction } from "@/modules/pestel/actions";
import type { TenantRow } from "@/lib/types/tenant";

/** Tavily + OpenAI per perspectief kan meerdere minuten duren (Vercel). */
export const maxDuration = 300;

export default async function PestelPage({
  params,
}: PageProps<"/klanten/[tenantId]/strategie/pestel">) {
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

  const loaded = await loadPestelWorkbenchAction(tenantId);
  if (!loaded.ok || !loaded.data) {
    notFound();
  }

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  return (
    <PestelWorkspace
      key={loaded.data.version.id}
      tenantId={tenantId}
      tenantName={tenantName}
      initialVersion={loaded.data.version}
      initialInsights={loaded.data.insights}
      initialMeetings={loaded.data.meetings}
      initialResearchInputs={loaded.data.researchInputs}
      initialActiveJob={loaded.data.activeResearchJob}
      initialLastResearchError={loaded.data.lastResearchError}
    />
  );
}
