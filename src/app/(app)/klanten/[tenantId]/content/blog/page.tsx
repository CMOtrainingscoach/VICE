import { notFound, redirect } from "next/navigation";
import { BlogWorkspace } from "@/components/content/blog-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { parseBloggerPublic } from "@/lib/integrations/blogger";
import {
  listBlogConceptsAction,
  loadBlogBrandContextAction,
} from "@/modules/content/blog-actions";

export const maxDuration = 300;

export default async function BlogContentPage({
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

  const [brand, concepts] = await Promise.all([
    loadBlogBrandContextAction(tenantId),
    listBlogConceptsAction(tenantId),
  ]);

  if (!brand.ok || !brand.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Blogpost kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{brand.ok ? "Geen merkcontext." : brand.error}</p>
      </div>
    );
  }

  const bloggerStatus = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
  });
  const blogger = !bloggerStatus.error ? parseBloggerPublic(bloggerStatus.data) : null;

  return (
    <BlogWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name || brand.data.tenantName}
      brand={brand.data}
      initial={null}
      concepts={concepts.ok ? concepts.data ?? [] : []}
      bloggerReady={Boolean(blogger?.connected && blogger.blogId)}
      bloggerBlogName={blogger?.blogName ?? null}
    />
  );
}
