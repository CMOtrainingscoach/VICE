import { notFound, redirect } from "next/navigation";
import { VideoWorkspace } from "@/components/content/video-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { listVideoConceptsAction, loadVideoConceptAction } from "@/modules/content/video-actions";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { listBeeldCompositionsAction } from "@/modules/content/beeld-actions";

export const maxDuration = 300;

export default async function VideoConceptPage({
  params,
}: {
  params: Promise<{ tenantId: string; videoId: string }>;
}) {
  const { tenantId, videoId } = await params;
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

  const [concept, concepts, beeldCompositions, clientBrandView] = await Promise.all([
    loadVideoConceptAction(videoId),
    listVideoConceptsAction(tenantId),
    listBeeldCompositionsAction(tenantId),
    loadClientBrandAction(tenantId),
  ]);

  if (!concept.ok || !concept.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Video niet gevonden</h1>
        <p className="mt-3 text-sm text-red-700">{concept.ok ? "Geen gegevens." : concept.error}</p>
      </div>
    );
  }

  if (concept.data.tenantId !== tenantId) {
    redirect(`/klanten/${concept.data.tenantId}/content/video/${videoId}`);
  }

  return (
    <VideoWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={concept.data}
      concepts={concepts.ok ? concepts.data ?? [] : []}
      beeldCompositions={beeldCompositions.ok ? beeldCompositions.data ?? [] : []}
      clientBrand={clientBrandView.ok ? clientBrandView.data?.brand ?? null : null}
    />
  );
}
