import { redirect } from "next/navigation";

export default async function LegacyLeadgenRunPage({
  params,
}: {
  params: Promise<{ tenantId: string; runId: string }>;
}) {
  const { tenantId, runId } = await params;
  redirect(`/klanten/${tenantId}/leadgen/${runId}`);
}
