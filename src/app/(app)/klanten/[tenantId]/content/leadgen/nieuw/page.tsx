import { redirect } from "next/navigation";

export default async function LegacyLeadgenNewPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  redirect(`/klanten/${tenantId}/leadgen/nieuw`);
}
