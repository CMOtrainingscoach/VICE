"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TenantForm } from "@/components/clients/tenant-form";
import { TenantAdminPanel } from "@/components/clients/tenant-admin-panel";
import { TenantIntegrationsPanel } from "@/components/clients/tenant-integrations-panel";
import type { BloggerPublicStatus } from "@/lib/integrations/blogger";
import type { GoogleAnalyticsPublicStatus } from "@/lib/integrations/google-analytics";
import type { SearchConsolePublicStatus } from "@/lib/integrations/search-console";
import type { WordPressPublicStatus } from "@/lib/integrations/wordpress";
import type { TenantRow } from "@/lib/types/tenant";

export type TenantDetailTab = "gegevens" | "instellingen";

export function TenantDetailTabs({
  tenant,
  tab,
  blogger,
  searchConsole,
  googleAnalytics,
  wordpress,
  bloggerFlash,
  gscFlash,
  gaFlash,
}: {
  tenant: TenantRow;
  tab: TenantDetailTab;
  blogger: BloggerPublicStatus;
  searchConsole: SearchConsolePublicStatus;
  googleAnalytics: GoogleAnalyticsPublicStatus;
  wordpress: WordPressPublicStatus;
  bloggerFlash?: string | null;
  gscFlash?: string | null;
  gaFlash?: string | null;
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
          initialSearchConsole={searchConsole}
          initialGoogleAnalytics={googleAnalytics}
          initialWordPress={wordpress}
          bloggerFlash={bloggerFlash}
          gscFlash={gscFlash}
          gaFlash={gaFlash}
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
