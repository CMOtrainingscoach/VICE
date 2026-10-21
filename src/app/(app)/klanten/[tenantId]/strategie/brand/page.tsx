import { notFound, redirect } from "next/navigation";
import { BrandWorkspace } from "@/components/brand/brand-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { loadContentLearningsAction } from "@/modules/content/content-learning-actions";
import type { ContentLearningEvent } from "@/lib/content/content-learning-types";
import { listBuyerPersonasForIcpAction } from "@/modules/brand/buyer-persona-actions";
import { listTenantIcpsAction } from "@/modules/strategy/icp-actions";
import type { BuyerPersona } from "@/lib/brand/buyer-persona-types";

export default async function ClientBrandPage({
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

  const [loaded, learningsResult, icpList] = await Promise.all([
    loadClientBrandAction(tenantId),
    loadContentLearningsAction(tenantId, { limit: 40 }),
    listTenantIcpsAction(tenantId),
  ]);
  const initialLearnings: ContentLearningEvent[] =
    learningsResult.ok && learningsResult.data ? learningsResult.data : [];
  const icpOptions = icpList.ok && icpList.data ? icpList.data : [];
  const initialIcpId = icpOptions.find((i) => i.isPrimary)?.id ?? icpOptions[0]?.id ?? null;
  let initialPersonas: BuyerPersona[] = [];
  if (initialIcpId) {
    const personas = await listBuyerPersonasForIcpAction(tenantId, initialIcpId);
    if (personas.ok && personas.data) initialPersonas = personas.data;
  }

  if (!loaded.ok || !loaded.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
        <h1 className="text-xl font-semibold">Brand kon niet laden</h1>
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">
          {loaded.ok ? "Geen gegevens." : loaded.error}
        </p>
      </div>
    );
  }

  return (
    <BrandWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name || loaded.data.tenantName}
      initial={loaded.data.brand}
      initialLearnings={initialLearnings}
      icpOptions={icpOptions}
      initialIcpId={initialIcpId}
      initialPersonas={initialPersonas}
    />
  );
}
