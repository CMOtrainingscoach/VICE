import { notFound, redirect } from "next/navigation";
import { AdsWorkspace } from "@/components/content/ads-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import {
  listAdConceptsAction,
  listAdFoldersAction,
  loadAdConceptAction,
} from "@/modules/content/ad-actions";
import { listContentBuyerPersonasAction } from "@/modules/content/audience-actions";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { listBrandCharactersForContentAction } from "@/modules/brand/character-actions";
import { listBeeldCompositionsAction } from "@/modules/content/beeld-actions";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";

export const maxDuration = 300;

export default async function AdConceptPage({
  params,
}: {
  params: Promise<{ tenantId: string; adId: string }>;
}) {
  const { tenantId, adId } = await params;
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

  const [brand, concept, concepts, folders, buyerPersonas, brandCharacters, clientBrandView, beeldCompositions] =
    await Promise.all([
      loadBlogBrandContextAction(tenantId),
      loadAdConceptAction(adId),
      listAdConceptsAction(tenantId),
      listAdFoldersAction(tenantId),
      listContentBuyerPersonasAction(tenantId),
      listBrandCharactersForContentAction(tenantId),
      loadClientBrandAction(tenantId),
      listBeeldCompositionsAction(tenantId),
    ]);

  const brandHref = brand.ok && brand.data ? brand.data.brandHref : `/klanten/${tenantId}/merk`;

  if (!concept.ok || !concept.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Advertentie niet gevonden</h1>
        <p className="mt-3 text-sm text-red-700">{concept.ok ? "Geen gegevens." : concept.error}</p>
      </div>
    );
  }

  if (concept.data.tenantId !== tenantId) {
    redirect(`/klanten/${concept.data.tenantId}/content/ads/${adId}`);
  }

  return (
    <AdsWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      brandHref={brandHref}
      initial={concept.data}
      concepts={concepts.ok ? concepts.data ?? [] : []}
      folders={folders.ok ? folders.data ?? [] : []}
      buyerPersonaOptions={buyerPersonas.ok ? buyerPersonas.data ?? [] : []}
      brandCharacterOptions={brandCharacters.ok ? brandCharacters.data ?? [] : []}
      beeldCompositions={beeldCompositions.ok ? beeldCompositions.data ?? [] : []}
      clientBrand={clientBrandView.ok ? clientBrandView.data?.brand ?? null : null}
    />
  );
}
