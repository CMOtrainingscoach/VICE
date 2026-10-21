import { notFound, redirect } from "next/navigation";
import { SocialWorkspace } from "@/components/content/social-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import {
  listBlogConceptsAction,
  listBlogSourceMeetingsAction,
  loadBlogBrandContextAction,
} from "@/modules/content/blog-actions";
import {
  listSocialPostConceptsAction,
  loadSocialPostConceptAction,
} from "@/modules/content/social-actions";
import { listContentBuyerPersonasAction } from "@/modules/content/audience-actions";

export const maxDuration = 300;

export default async function SocialConceptPage({
  params,
}: {
  params: Promise<{ tenantId: string; conceptId: string }>;
}) {
  const { tenantId, conceptId } = await params;
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

  const [brand, concept, concepts, blogs, meetings, buyerPersonas] = await Promise.all([
    loadBlogBrandContextAction(tenantId),
    loadSocialPostConceptAction(conceptId),
    listSocialPostConceptsAction(tenantId),
    listBlogConceptsAction(tenantId),
    listBlogSourceMeetingsAction(tenantId),
    listContentBuyerPersonasAction(tenantId),
  ]);

  if (!brand.ok || !brand.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Socialmediapost kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700">{brand.ok ? "Geen merkcontext." : brand.error}</p>
      </div>
    );
  }

  if (!concept.ok || !concept.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Concept niet gevonden</h1>
        <p className="mt-3 text-sm text-red-700">{concept.ok ? "Geen gegevens." : concept.error}</p>
      </div>
    );
  }

  if (concept.data.tenantId !== tenantId) {
    redirect(`/klanten/${concept.data.tenantId}/content/social/${conceptId}`);
  }

  return (
    <SocialWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name || brand.data.tenantName}
      brand={brand.data}
      initial={concept.data}
      concepts={concepts.ok ? concepts.data ?? [] : []}
      blogs={blogs.ok ? blogs.data ?? [] : []}
      meetings={meetings.ok ? meetings.data ?? [] : []}
      buyerPersonaOptions={buyerPersonas.ok ? buyerPersonas.data ?? [] : []}
    />
  );
}
