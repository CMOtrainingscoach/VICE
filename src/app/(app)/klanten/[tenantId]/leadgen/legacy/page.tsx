import { notFound, redirect } from "next/navigation";
import { LeadgenRunList } from "@/components/leadgen/leadgen-run-list";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { listLeadgenRunsAction } from "@/modules/leadgen/actions";

export default async function LegacyLeadgenPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const runs = await listLeadgenRunsAction(tenantId);
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;

  return (
    <LeadgenRunList
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initialRuns={runs.ok ? runs.data ?? [] : []}
      mapsApiKey={mapsApiKey}
    />
  );
}
