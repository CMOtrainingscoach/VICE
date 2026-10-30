import { notFound, redirect } from "next/navigation";
import { AdsWorkspace } from "@/components/content/ads-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { listAdConceptsAction, listAdFoldersAction } from "@/modules/content/ad-actions";
import { listContentBuyerPersonasAction } from "@/modules/content/audience-actions";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { listBrandCharactersForContentAction } from "@/modules/brand/character-actions";
import { listBeeldCompositionsAction } from "@/modules/content/beeld-actions";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";

export const maxDuration = 300;

export default async function AdsContentPage({
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

  const [brand, concepts, folders, buyerPersonas, brandCharacters, clientBrandView, beeldCompositions] =
    await Promise.all([
      loadBlogBrandContextAction(tenantId),
      listAdConceptsAction(tenantId),
      listAdFoldersAction(tenantId),
      listContentBuyerPersonasAction(tenantId),
      listBrandCharactersForContentAction(tenantId),
      loadClientBrandAction(tenantId),
      listBeeldCompositionsAction(tenantId),
    ]);

  const brandHref = brand.ok && brand.data ? brand.data.brandHref : `/klanten/${tenantId}/merk`;

  return (
    <AdsWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      brandHref={brandHref}
      initial={null}
      concepts={concepts.ok ? concepts.data ?? [] : []}
      folders={folders.ok ? folders.data ?? [] : []}
      buyerPersonaOptions={buyerPersonas.ok ? buyerPersonas.data ?? [] : []}
      brandCharacterOptions={brandCharacters.ok ? brandCharacters.data ?? [] : []}
      beeldCompositions={beeldCompositions.ok ? beeldCompositions.data ?? [] : []}
      clientBrand={clientBrandView.ok ? clientBrandView.data?.brand ?? null : null}
    />
  );
}
