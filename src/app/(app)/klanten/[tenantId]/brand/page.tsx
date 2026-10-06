import { BrandProfileWorkspace } from "@/components/brand-profile/brand-profile-workspace";
import { loadBrandProfileAction } from "@/modules/brand-profile/actions";

export default async function BrandProfilePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const result = await loadBrandProfileAction(tenantId);
  if (!result.ok || !result.data) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm">{result.ok ? "Het merkprofiel kon niet geladen worden." : result.error}</p>;
  }
  return <BrandProfileWorkspace tenantId={tenantId} data={result.data} />;
}
