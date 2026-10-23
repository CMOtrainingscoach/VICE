import { redirect } from "next/navigation";

export default async function LegacyLeadgenPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  redirect(`/klanten/${tenantId}/leadgen`);
}
