import { redirect } from "next/navigation";

export default async function StrategieHubPage({
  params,
}: PageProps<"/klanten/[tenantId]/strategie">) {
  const { tenantId } = await params;
  redirect(`/klanten/${tenantId}/strategie/pestel`);
}
