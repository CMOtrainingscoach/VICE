import { redirect } from "next/navigation";

export default async function VerkoopContentPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  redirect(`/klanten/${tenantId}/content/leadgen`);
}
