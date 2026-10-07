"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
};

type ClientNav = {
  tenantId: string;
  tenantName: string;
};

type AppShellProps = {
  children: React.ReactNode;
  userLabel: string;
  isPlatformAdmin: boolean;
  clientNav?: ClientNav | null;
};

const UUID_RE =
  /^\/klanten\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function NavLink({
  href,
  label,
  active,
  icon,
  indent,
  disabled,
}: NavItem & {
  active: boolean;
  icon?: React.ReactNode;
  indent?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        className={cn(
          "block rounded-md px-3 py-2 text-sm text-vice-text-muted/60",
          indent && "pl-6",
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        indent && "pl-6",
        active
          ? "bg-vice-surface font-medium text-vice-gold"
          : "text-vice-text-muted hover:bg-vice-surface hover:text-vice-text",
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-vice-gold"
          aria-hidden
        />
      )}
      {icon}
      {label}
    </Link>
  );
}

export function AppShell({
  children,
  userLabel,
  isPlatformAdmin,
  clientNav,
}: AppShellProps) {
  const pathname = usePathname();
  const [workspaceTenant, setWorkspaceTenant] = useState<ClientNav | null>(null);

  const tenantIdFromPath = useMemo(() => {
    const m = pathname.match(UUID_RE);
    return m?.[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    if (!isPlatformAdmin || !tenantIdFromPath) {
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .schema("app")
      .from("my_tenants")
      .select("id, name")
      .eq("id", tenantIdFromPath)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setWorkspaceTenant({ tenantId: data.id, tenantName: data.name });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin, tenantIdFromPath]);

  const activeClient =
    clientNav ??
    (tenantIdFromPath && workspaceTenant?.tenantId === tenantIdFromPath
      ? workspaceTenant
      : tenantIdFromPath
        ? workspaceTenant
        : null);
  const meetingsActive = pathname.includes("/meetings");

  const initials = userLabel
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-vice-bg">
      <aside className="flex w-64 shrink-0 flex-col border-r border-vice-border bg-vice-sidebar">
        <div className="border-b border-vice-border px-5 py-5">
          <Link
            href={isPlatformAdmin ? "/vandaag" : activeClient ? `/klanten/${activeClient.tenantId}` : "/vandaag"}
            className="font-display text-xl font-semibold tracking-tight text-vice-text"
            style={{ fontFamily: "var(--font-vice-display)" }}
          >
            VICE
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Hoofdnavigatie">
          {isPlatformAdmin && (
            <>
              <NavLink
                href="/vandaag"
                label="Vandaag"
                active={pathname === "/vandaag"}
                icon={<Home className="size-4 opacity-70" aria-hidden />}
              />
              <NavLink
                href="/klanten"
                label="Klanten"
                active={
                  pathname.startsWith("/klanten") && !tenantIdFromPath
                }
                icon={<Users className="size-4 opacity-70" aria-hidden />}
              />
            </>
          )}

          {activeClient && (
            <div className="pt-3">
              <p className="px-3 pb-2 text-sm font-medium text-vice-text">
                {activeClient.tenantName}
              </p>
              <NavLink
                href={`/klanten/${activeClient.tenantId}`}
                label="Overzicht"
                active={pathname === `/klanten/${activeClient.tenantId}`}
                indent
              />
              <NavLink
                href={`/klanten/${activeClient.tenantId}/meetings`}
                label="Meetings"
                active={meetingsActive}
                indent
              />
              <NavLink
                href="#"
                label="Documenten"
                active={false}
                indent
                disabled
              />
            </div>
          )}

          {!isPlatformAdmin && clientNav && (
            <div className="pt-2">
              <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-vice-text-muted">
                {clientNav.tenantName}
              </p>
              <NavLink
                href={`/klanten/${clientNav.tenantId}`}
                label="Overzicht"
                active={pathname === `/klanten/${clientNav.tenantId}`}
              />
            </div>
          )}
        </nav>

        <div className="border-t border-vice-border px-3 py-4">
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-vice-surface-muted text-xs font-semibold text-vice-text"
                aria-hidden
              >
                {initials || "?"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-vice-text">
                  {userLabel.split(/\s+/)[0] ?? userLabel}
                </p>
                <Link
                  href="/instellingen"
                  className="text-xs text-vice-text-muted hover:text-vice-text"
                >
                  Instellingen
                </Link>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
