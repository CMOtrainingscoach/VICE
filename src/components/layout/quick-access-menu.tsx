"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  quickAccessItemsFor,
  type QuickAccessContext,
} from "@/lib/navigation/quick-access";
import { cn } from "@/lib/utils";

const UUID_RE =
  /^\/klanten\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

type QuickAccessMenuProps = {
  tenantId?: string | null;
  isPlatformAdmin: boolean;
};

export function QuickAccessMenu({ tenantId: tenantIdProp, isPlatformAdmin }: QuickAccessMenuProps) {
  const pathname = usePathname();
  const tenantIdFromPath = useMemo(() => {
    const m = pathname.match(UUID_RE);
    return m?.[1] ?? null;
  }, [pathname]);

  const ctx: QuickAccessContext = {
    tenantId: tenantIdProp ?? tenantIdFromPath,
    isPlatformAdmin,
  };

  const items = quickAccessItemsFor(ctx);
  if (!items.length) return null;

  return (
    <nav
      aria-label="Snelle toegang"
      className="pointer-events-none fixed right-4 top-3 z-50 flex items-center gap-0.5 rounded-lg border border-vice-border bg-vice-surface/95 p-0.5 shadow-md backdrop-blur-sm"
    >
      {items.map((item) => {
        const href = item.href(ctx);
        const Icon = item.icon;
        const active = href
          ? item.id === "meeting-recorder"
            ? pathname.includes("/meetings/nieuw")
            : pathname === href || pathname.startsWith(`${href}/`)
          : false;

        const className = cn(
          "pointer-events-auto flex size-9 items-center justify-center rounded-md transition-colors",
          href
            ? active
              ? "bg-vice-gold/15 text-vice-gold"
              : "text-vice-text-muted hover:bg-vice-bg hover:text-vice-text"
            : "cursor-not-allowed text-vice-text-muted/40",
        );

        if (!href) {
          return (
            <span
              key={item.id}
              className={className}
              title={`${item.title} — open eerst een klant`}
              aria-disabled
            >
              <Icon className="size-4" aria-hidden />
              <span className="sr-only">{item.label}</span>
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            href={href}
            className={className}
            title={item.title}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
