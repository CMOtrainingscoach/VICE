import { redirect } from "next/navigation";
import { MARKETING_5C_ROUTE, SWOT_ROUTE } from "@/lib/marketing-5c/constants";
import { getUserAppContext } from "@/lib/auth/context";
import { BCG_ROUTE, VRIO_ROUTE } from "@/lib/vrio/constants";
import { STP_ROUTE, VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import { getAuditFrameworkProgressAction } from "@/modules/porter/actions";

export default async function StrategieHubPage({
  params,
}: PageProps<"/klanten/[tenantId]/strategie">) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");

  if (ctx.isPlatformAdmin) {
    const progress = await getAuditFrameworkProgressAction(tenantId);
    if (progress.ok && progress.data?.valueChainApproved) {
      redirect(`/klanten/${tenantId}/strategie/${STP_ROUTE}`);
    }
    if (progress.ok && progress.data?.bcgApproved) {
      redirect(`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`);
    }
    if (progress.ok && progress.data?.vrioApproved) {
      redirect(`/klanten/${tenantId}/strategie/${BCG_ROUTE}`);
    }
    if (progress.ok && progress.data?.swotApproved) {
      redirect(`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`);
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
