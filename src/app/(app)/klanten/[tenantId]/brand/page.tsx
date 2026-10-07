import { BrandProfileWorkspace } from "@/components/brand-profile/brand-profile-workspace";
import { loadBrandProfileAction } from "@/modules/brand-profile/actions";

export default async function BrandProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ fout?: string | string[] }>;
}) {
  const { tenantId } = await params;
  const query = await searchParams;
  const fout = Array.isArray(query.fout) ? query.fout[0] : query.fout;
  const result = await loadBrandProfileAction(tenantId);
  if (!result.ok || !result.data) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-sm">{result.ok ? "Het merkprofiel kon niet geladen worden." : result.error}</p>;
  }
  return <BrandProfileWorkspace tenantId={tenantId} data={result.data} initialError={fout ?? ""} />;
}
