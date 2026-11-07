"use client";

import Link from "next/link";

export type WebsiteSectionTab = "overzicht" | "crawl";

export function WebsiteSectionTabs({
  tenantId,
  tab,
}: {
  tenantId: string;
  tab: WebsiteSectionTab;
}) {
  const base = `/klanten/${tenantId}/strategie/website`;
  return (
    <div
      role="tablist"
      aria-label="Website"
      className="mb-6 flex gap-1 border-b border-vice-border"
    >
      <TabLink href={base} active={tab === "overzicht"}>
        Overzicht
      </TabLink>
      <TabLink href={`${base}?tab=crawl`} active={tab === "crawl"}>
        Website crawl
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
  children: string;
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
