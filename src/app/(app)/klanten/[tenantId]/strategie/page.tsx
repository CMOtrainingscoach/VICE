import { redirect } from "next/navigation";
import { MARKETING_5C_ROUTE, SWOT_ROUTE } from "@/lib/marketing-5c/constants";
import { getUserAppContext } from "@/lib/auth/context";
import { getAuditFrameworkProgressAction } from "@/modules/porter/actions";

export default async function StrategieHubPage({
  params,
}: PageProps<"/klanten/[tenantId]/strategie">) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");

  if (ctx.isPlatformAdmin) {
    const progress = await getAuditFrameworkProgressAction(tenantId);
    if (progress.ok && progress.data?.swotApproved) {
      redirect(`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`);
    }
    if (progress.ok && progress.data?.fiveCApproved) {
      redirect(`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`);
    }
    if (progress.ok && progress.data?.porterApproved) {
      redirect(`/klanten/${tenantId}/strategie/${MARKETING_5C_ROUTE}`);
    }
    if (progress.ok && progress.data?.pestelApproved) {
      redirect(`/klanten/${tenantId}/strategie/porter`);
    }
  }

  redirect(`/klanten/${tenantId}/strategie/pestel`);
}
