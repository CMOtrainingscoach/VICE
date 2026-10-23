import { notFound, redirect } from "next/navigation";
import { LeadgenRunList } from "@/components/leadgen/leadgen-run-list";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { listLeadgenRunsAction } from "@/modules/leadgen/actions";

export const maxDuration = 300;

export default async function LeadgenPage({ params }: { params: Promise<{ tenantId: string }> }) {
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

  const runs = await listLeadgenRunsAction(tenantId);
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;

  if (!runs.ok) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Leadgen kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700">{runs.error}</p>
      </div>
    );
  }

  return (
    <LeadgenRunList
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initialRuns={runs.data ?? []}
      mapsApiKey={mapsApiKey}
    />
  );
}
