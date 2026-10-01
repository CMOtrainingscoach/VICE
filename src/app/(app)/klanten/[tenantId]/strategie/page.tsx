import { redirect } from "next/navigation";
import { getUserAppContext } from "@/lib/auth/context";
import { loadPorterWorkbenchAction } from "@/modules/porter/actions";

export default async function StrategieHubPage({
  params,
}: PageProps<"/klanten/[tenantId]/strategie">) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");

  if (ctx.isPlatformAdmin) {
    const porter = await loadPorterWorkbenchAction(tenantId);
    if (porter.ok && porter.data?.pestelContext.approved) {
      redirect(`/klanten/${tenantId}/strategie/porter`);
    }
  }

  redirect(`/klanten/${tenantId}/strategie/pestel`);
}
