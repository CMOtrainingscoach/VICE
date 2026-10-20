"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type StrategyAuditTab = "document" | "cijfers" | "zoekwoorden";

export function StrategyAuditTabs({
  tenantId,
  tab,
}: {
  tenantId: string;
  tab: StrategyAuditTab;
}) {
  const base = `/klanten/${tenantId}/strategie`;
  return (
    <div
      role="tablist"
      aria-label="Strategische audit"
      className="mb-2 flex gap-1 border-b border-vice-border"
    >
      <TabLink href={`${base}?tab=document`} active={tab === "document"}>
        Document
      </TabLink>
      <TabLink href={`${base}?tab=cijfers`} active={tab === "cijfers"}>
        Cijfers
      </TabLink>
      <TabLink href={`${base}?tab=zoekwoorden`} active={tab === "zoekwoorden"}>
        Zoekwoorden
      </TabLink>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={
        active
          ? "-mb-px border-b-2 border-vice-gold px-4 py-2.5 text-sm font-medium text-vice-text"
          : "px-4 py-2.5 text-sm font-medium text-vice-text-muted hover:text-vice-text"
      }
    >
      {children}
    </Link>
  );
}
