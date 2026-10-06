import { AuditProgressProvider } from "@/components/audit/audit-step-nav";
import { getAuditFrameworkProgressAction } from "@/modules/porter/actions";

export default async function StrategieLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const progress = await getAuditFrameworkProgressAction(tenantId);

  return (
    <AuditProgressProvider tenantId={tenantId} progress={progress.ok ? progress.data ?? null : null}>
      {children}
    </AuditProgressProvider>
  );
}
