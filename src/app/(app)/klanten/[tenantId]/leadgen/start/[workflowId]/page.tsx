import { notFound, redirect } from "next/navigation";
import { SalesbrainGuidedWorkspace } from "@/components/salesbrain/salesbrain-guided-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { canAccessTenant } from "@/lib/auth/tenant-access";
import { salesbrainEnabled } from "@/lib/salesbrain/flags";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

export default async function SalesbrainStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; workflowId: string }>;
  searchParams: Promise<{ test?: string }>;
}) {
  const { tenantId, workflowId } = await params;
  const { test } = await searchParams;
  if (!salesbrainEnabled()) redirect(`/klanten/${tenantId}/leadgen`);
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!canAccessTenant(ctx, tenantId)) redirect("/");

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;

  return (
    <SalesbrainGuidedWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      workflowId={workflowId}
      workflowName="Eerste marketeer — groeisignalen"
      mapsApiKey={mapsApiKey}
      testMode={test === "1" || test === "true"}
    />
  );
}
