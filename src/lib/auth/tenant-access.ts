import type { UserAppContext } from "@/lib/auth/context";

/** Tenant page access: platform admin or single client membership for this tenant. */
export function canAccessTenant(ctx: UserAppContext, tenantId: string): boolean {
  if (ctx.isPlatformAdmin) return true;
  return ctx.clientTenant?.id === tenantId;
}
