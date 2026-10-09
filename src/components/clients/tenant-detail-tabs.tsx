"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TenantForm } from "@/components/clients/tenant-form";
import { TenantAdminPanel } from "@/components/clients/tenant-admin-panel";
import { TenantIntegrationsPanel } from "@/components/clients/tenant-integrations-panel";
import type { BloggerPublicStatus } from "@/lib/integrations/blogger";
import type { TenantRow } from "@/lib/types/tenant";

export type TenantDetailTab = "gegevens" | "instellingen";

export function TenantDetailTabs({
  tenant,
  tab,
  blogger,
  bloggerFlash,
}: {
  tenant: TenantRow;
  tab: TenantDetailTab;
  blogger: BloggerPublicStatus;
  bloggerFlash?: string | null;
}) {
  const base = `/klanten/${tenant.id}`;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Klantsecties"
        className="mb-6 flex gap-1 border-b border-vice-border"
      >
        <TabLink href={`${base}?tab=gegevens`} active={tab === "gegevens"}>
          Klantgegevens
        </TabLink>
        <TabLink href={`${base}?tab=instellingen`} active={tab === "instellingen"}>
          Instellingen
        </TabLink>
      </div>

      {tab === "gegevens" ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 text-lg font-medium">Gegevens</h2>
            <TenantForm mode="edit" tenant={tenant} />
          </div>
          <TenantAdminPanel tenant={tenant} />
        </div>
      ) : (
        <TenantIntegrationsPanel
          tenantId={tenant.id}
          initialBlogger={blogger}
          bloggerFlash={bloggerFlash}
        />
      )}
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
