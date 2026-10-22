import { notFound, redirect } from "next/navigation";
import { ContentComingSoon } from "@/components/content/content-coming-soon";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

export default async function VerkoopContentPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
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

  return (
    <ContentComingSoon
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      title="Verkoop"
    />
  );
}
