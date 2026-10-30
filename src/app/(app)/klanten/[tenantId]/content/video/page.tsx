import { notFound, redirect } from "next/navigation";
import { VideoWorkspace } from "@/components/content/video-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { listVideoConceptsAction } from "@/modules/content/video-actions";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { listBeeldCompositionsAction } from "@/modules/content/beeld-actions";

export const maxDuration = 300;

export default async function VideoContentPage({
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

  const [concepts, beeldCompositions, clientBrandView] = await Promise.all([
    listVideoConceptsAction(tenantId),
    listBeeldCompositionsAction(tenantId),
    loadClientBrandAction(tenantId),
  ]);

  return (
    <VideoWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={null}
      concepts={concepts.ok ? concepts.data ?? [] : []}
      beeldCompositions={beeldCompositions.ok ? beeldCompositions.data ?? [] : []}
      clientBrand={clientBrandView.ok ? clientBrandView.data?.brand ?? null : null}
    />
  );
}
