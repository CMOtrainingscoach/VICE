import { notFound, redirect } from "next/navigation";
import { BeeldWorkspace } from "@/components/content/beeld-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { listBrandCharactersForContentAction } from "@/modules/brand/character-actions";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { listBeeldCompositionsAction } from "@/modules/content/beeld-actions";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

export const maxDuration = 300;

export default async function BeeldContentPage({
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

  const [brand, clientBrandView, compositions, brandCharacters] = await Promise.all([
    loadBlogBrandContextAction(tenantId),
    loadClientBrandAction(tenantId),
    listBeeldCompositionsAction(tenantId),
    listBrandCharactersForContentAction(tenantId),
  ]);

  if (!brand.ok || !brand.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Beeldmateriaal kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700">{brand.ok ? "Geen merkcontext." : brand.error}</p>
      </div>
    );
  }

  return (
    <BeeldWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name || brand.data.tenantName}
      brand={brand.data}
      clientBrand={clientBrandView.ok ? clientBrandView.data?.brand ?? null : null}
      initial={null}
      compositions={compositions.ok ? compositions.data ?? [] : []}
      brandCharacterOptions={brandCharacters.ok ? brandCharacters.data ?? [] : []}
    />
  );
}
