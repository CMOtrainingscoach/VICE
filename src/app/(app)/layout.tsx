import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getUserAppContext } from "@/lib/auth/context";
import { requirePlatformAdminMfa } from "@/lib/auth/session";
import { salesbrainEnabled } from "@/lib/salesbrain/flags";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getUserAppContext();
  if (!ctx) {
    redirect("/login");
  }

  if (ctx.isPlatformAdmin) {
    await requirePlatformAdminMfa(ctx.session);
  }

  return (
    <AppShell
      userLabel={ctx.profileDisplayName}
      isPlatformAdmin={ctx.isPlatformAdmin}
      salesbrainEnabled={salesbrainEnabled()}
      clientNav={
        ctx.clientTenant
          ? { tenantId: ctx.clientTenant.id, tenantName: ctx.clientTenant.name }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
