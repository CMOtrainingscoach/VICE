import { notFound, redirect } from "next/navigation";
import { ContentComingSoon } from "@/components/content/content-coming-soon";
import { getUserAppContext } from "@/lib/auth/context";
import { contentTypes, type ContentTypeId } from "@/lib/content/types";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

const ALLOWED = new Set<ContentTypeId>(["social", "blog", "email", "beeld"]);

export default async function ContentTypePage({
  params,
}: {
  params: Promise<{ tenantId: string; type: string }>;
}) {
  const { tenantId, type } = await params;
  if (type === "leadgen" || type === "verkoop") notFound();
  if (type === "blog") redirect(`/klanten/${tenantId}/content/blog`);
  if (type === "social") redirect(`/klanten/${tenantId}/content/social`);
  if (type === "beeld") redirect(`/klanten/${tenantId}/content/beeld`);
  if (!ALLOWED.has(type as ContentTypeId)) notFound();

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

  const item = contentTypes(tenantId).find((entry) => entry.id === type);
  if (!item) notFound();

  return (
    <ContentComingSoon
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      title={item.title}
    />
  );
}
