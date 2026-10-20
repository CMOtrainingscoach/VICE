"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GoogleIntegrationSection } from "@/components/clients/google-integration-section";
import type { BloggerBlog, BloggerPublicStatus } from "@/lib/integrations/blogger";
import type { GoogleAnalyticsPublicStatus } from "@/lib/integrations/google-analytics";
import type { SearchConsolePublicStatus } from "@/lib/integrations/search-console";
import {
  disconnectBloggerAction,
  listTenantBloggerBlogsAction,
  selectBloggerBlogAction,
} from "@/modules/integrations/blogger-actions";
import {
  disconnectGoogleAnalyticsAction,
  listTenantGoogleAnalyticsPropertiesAction,
  selectGoogleAnalyticsPropertyAction,
} from "@/modules/integrations/google-analytics-actions";
import {
  disconnectSearchConsoleAction,
  listTenantSearchConsoleSitesAction,
  selectSearchConsoleSiteAction,
} from "@/modules/integrations/search-console-actions";

const BLOGGER_FLASH: Record<string, string> = {
  connected: "Google Blogger is gekoppeld. Kies hieronder welke blog je wilt gebruiken.",
  denied: "Google-autorisatie geannuleerd.",
  invalid: "Ongeldige OAuth-callback.",
  state: "OAuth-sessie verlopen. Probeer opnieuw te koppelen.",
  token: "Tokenuitwisseling met Google mislukt.",
  save: "Koppeling opslaan mislukt. Controleer of migratie 20260330135100 is toegepast.",
  "not-configured": "Zet GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET in de omgeving.",
  forbidden: "Geen toegang tot deze koppeling.",
};

const GSC_FLASH: Record<string, string> = {
  connected: "Google Search Console is gekoppeld. Kies hieronder welke site VICE mag gebruiken.",
  denied: "Google-autorisatie geannuleerd.",
  invalid: "Ongeldige OAuth-callback.",
  state: "OAuth-sessie verlopen. Probeer opnieuw te koppelen.",
  token: "Tokenuitwisseling met Google mislukt.",
  save: "Koppeling opslaan mislukt. Controleer of migratie 20260330135400 is toegepast.",
  "not-configured": "Zet GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET in de omgeving.",
  forbidden: "Geen toegang tot deze koppeling.",
};

const GA_FLASH: Record<string, string> = {
  connected: "Google Analytics is gekoppeld. Kies hieronder welke GA4-property VICE mag gebruiken.",
  denied: "Google-autorisatie geannuleerd.",
  invalid: "Ongeldige OAuth-callback.",
  state: "OAuth-sessie verlopen. Probeer opnieuw te koppelen.",
  token: "Tokenuitwisseling met Google mislukt.",
  save: "Koppeling opslaan mislukt. Controleer of migratie 20260330135400 is toegepast.",
  "not-configured": "Zet GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET in de omgeving.",
  forbidden: "Geen toegang tot deze koppeling.",
};

export function TenantIntegrationsPanel({
  tenantId,
  initialBlogger,
  initialSearchConsole,
  initialGoogleAnalytics,
  bloggerFlash,
  gscFlash,
  gaFlash,
}: {
  tenantId: string;
  initialBlogger: BloggerPublicStatus;
  initialSearchConsole: SearchConsolePublicStatus;
  initialGoogleAnalytics: GoogleAnalyticsPublicStatus;
  bloggerFlash?: string | null;
  gscFlash?: string | null;
  gaFlash?: string | null;
}) {
  const router = useRouter();
  const [blogger, setBlogger] = useState(initialBlogger);
  const [searchConsole, setSearchConsole] = useState(initialSearchConsole);
  const [googleAnalytics, setGoogleAnalytics] = useState(initialGoogleAnalytics);
  const [blogs, setBlogs] = useState<BloggerBlog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    bloggerFlash ? BLOGGER_FLASH[bloggerFlash] ?? null : null,
  );
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setBlogger(initialBlogger);
  }, [initialBlogger]);

  useEffect(() => {
    setSearchConsole(initialSearchConsole);
  }, [initialSearchConsole]);

  useEffect(() => {
    setGoogleAnalytics(initialGoogleAnalytics);
  }, [initialGoogleAnalytics]);

  useEffect(() => {
    if (!blogger.connected) return;
    let cancelled = false;
    void (async () => {
      const result = await listTenantBloggerBlogsAction(tenantId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBlogs(result.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [blogger.connected, tenantId, blogger.updatedAt]);

  async function selectBlog(blog: BloggerBlog) {
    setBusy("select");
    setError(null);
    const result = await selectBloggerBlogAction(tenantId, blog);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) setBlogger(result.data);
    setMessage(`Blog «${blog.name}» is geselecteerd voor publicatie.`);
    router.refresh();
  }

  async function disconnectBlogger() {
    setBusy("disconnect");
    setError(null);
    const result = await disconnectBloggerAction(tenantId);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBlogger({
      connected: false,
      status: "disconnected",
      accountEmail: "",
      blogId: null,
      blogName: null,
      blogUrl: null,
      lastError: "",
    });
    setBlogs([]);
    setMessage("Google Blogger ontkoppeld.");
    router.refresh();
  }

  const loadGscSites = useCallback(async () => {
    const result = await listTenantSearchConsoleSitesAction(tenantId);
    if (!result.ok) return { ok: false as const, error: result.error };
    return {
      ok: true as const,
      data: (result.data ?? []).map((site) => ({
        id: site.siteUrl,
        title: site.siteUrl,
        subtitle: site.permissionLevel || undefined,
      })),
    };
  }, [tenantId]);

  const loadGaProperties = useCallback(async () => {
    const result = await listTenantGoogleAnalyticsPropertiesAction(tenantId);
    if (!result.ok) return { ok: false as const, error: result.error };
    return {
      ok: true as const,
      data: (result.data ?? []).map((property) => ({
        id: property.propertyId,
        title: property.propertyName,
        subtitle: property.accountName ? `Account: ${property.accountName}` : undefined,
      })),
    };
  }, [tenantId]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">Sitekoppelingen</h2>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
          Koppel externe sites en Google-diensten van deze klant voor publicatie en om later
          zoek- en analyticsdata in VICE te gebruiken.
        </p>
      </section>

      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-medium text-vice-text">Google Blogger</h3>
            <p className="mt-1 max-w-prose text-sm text-vice-text-muted">
              Publiceer blogposts vanuit VICE rechtstreeks naar de Blogger-site van de klant.
            </p>
          </div>
          {blogger.connected ? (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
              Gekoppeld
            </span>
          ) : (
            <span className="rounded-md bg-vice-bg px-2 py-1 text-xs font-medium text-vice-text-muted">
              Niet gekoppeld
            </span>
          )}
        </div>

        {message ? <p className="mt-4 text-sm text-vice-text">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {blogger.lastError ? <p className="mt-2 text-sm text-red-700">{blogger.lastError}</p> : null}

        {!blogger.connected ? (
          <div className="mt-5">
            <a
              href={`/api/integrations/blogger/connect?tenantId=${encodeURIComponent(tenantId)}`}
              className="inline-flex rounded-md bg-vice-gold px-4 py-2 text-sm font-medium text-white hover:bg-vice-gold-hover"
            >
              Koppel Google Blogger
            </a>
            <p className="mt-3 text-xs text-vice-text-muted">
              Redirect-URI: <code className="text-[11px]">/api/integrations/blogger/callback</code>
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-vice-text-muted">
              Account: <span className="text-vice-text">{blogger.accountEmail || "onbekend"}</span>
            </p>
            {blogger.blogId ? (
              <p className="text-sm text-vice-text">
                Actieve blog: <strong>{blogger.blogName ?? blogger.blogId}</strong>
                {blogger.blogUrl ? (
                  <>
                    {" "}
                    (
                    <a href={blogger.blogUrl} target="_blank" rel="noreferrer" className="underline">
                      openen
                    </a>
                    )
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-amber-800">Kies hieronder welke Blogger-site VICE mag gebruiken.</p>
            )}

            {blogs.length > 0 ? (
              <ul className="divide-y divide-vice-border rounded-md border border-vice-border">
                {blogs.map((blog) => {
                  const active = blog.id === blogger.blogId;
                  return (
                    <li key={blog.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-vice-text">{blog.name}</p>
                        {blog.url ? <p className="text-xs text-vice-text-muted">{blog.url}</p> : null}
                      </div>
                      <Button
                        type="button"
                        variant={active ? "secondary" : "primary"}
                        disabled={busy !== "" || active}
                        onClick={() => void selectBlog(blog)}
                      >
                        {active ? "Geselecteerd" : busy === "select" ? "Bezig…" : "Gebruik deze blog"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-vice-text-muted">Geen blogs gevonden op dit Google-account.</p>
            )}

            <Button type="button" variant="ghost" disabled={busy !== ""} onClick={() => void disconnectBlogger()}>
              {busy === "disconnect" ? "Bezig…" : "Ontkoppelen"}
            </Button>
          </div>
        )}
      </section>

      <GoogleIntegrationSection
        title="Google Search Console"
        description="Koppel Search Console om later zoekprestaties van de klant in VICE te kunnen gebruiken."
        connected={searchConsole.connected}
        accountEmail={searchConsole.accountEmail}
        selectedId={searchConsole.siteUrl}
        selectedLabel={searchConsole.siteUrl}
        lastError={searchConsole.lastError}
        connectHref={`/api/integrations/search-console/connect?tenantId=${encodeURIComponent(tenantId)}`}
        callbackPathLabel="/api/integrations/search-console/callback"
        connectButtonLabel="Koppel Search Console"
        emptyListMessage="Geen sites gevonden op dit Google-account."
        selectPrompt="Kies hieronder welke site VICE mag gebruiken voor Search Console-data."
        selectedMessage={(label) => `Actieve site: ${label}`}
        disconnectedMessage="Google Search Console ontkoppeld."
        initialFlash={gscFlash}
        flashMessages={GSC_FLASH}
        reloadKey={`${searchConsole.connected}-${searchConsole.updatedAt ?? ""}`}
        onLoadList={loadGscSites}
        onSelect={async (item) => {
          const result = await selectSearchConsoleSiteAction(tenantId, {
            siteUrl: item.id,
            permissionLevel: item.subtitle ?? "",
          });
          if (result.ok && result.data) setSearchConsole(result.data);
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
        onDisconnect={async () => {
          const result = await disconnectSearchConsoleAction(tenantId);
          if (result.ok) {
            setSearchConsole({
              connected: false,
              status: "disconnected",
              accountEmail: "",
              siteUrl: null,
              lastError: "",
            });
          }
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
      />

      <GoogleIntegrationSection
        title="Google Analytics"
        description="Koppel GA4 (read-only) om later bezoekersdata van de klant in VICE te kunnen gebruiken."
        connected={googleAnalytics.connected}
        accountEmail={googleAnalytics.accountEmail}
        selectedId={googleAnalytics.propertyId}
        selectedLabel={googleAnalytics.propertyName}
        lastError={googleAnalytics.lastError}
        connectHref={`/api/integrations/google-analytics/connect?tenantId=${encodeURIComponent(tenantId)}`}
        callbackPathLabel="/api/integrations/google-analytics/callback"
        connectButtonLabel="Koppel Google Analytics"
        emptyListMessage="Geen GA4-properties gevonden op dit Google-account."
        selectPrompt="Kies hieronder welke GA4-property VICE mag gebruiken."
        selectedMessage={(label) => `Actieve property: ${label}`}
        disconnectedMessage="Google Analytics ontkoppeld."
        initialFlash={gaFlash}
        flashMessages={GA_FLASH}
        reloadKey={`${googleAnalytics.connected}-${googleAnalytics.updatedAt ?? ""}`}
        onLoadList={loadGaProperties}
        onSelect={async (item) => {
          const list = await listTenantGoogleAnalyticsPropertiesAction(tenantId);
          const match = list.ok ? list.data?.find((p) => p.propertyId === item.id) : undefined;
          if (!match) return { ok: false, error: "Property niet gevonden" };
          const result = await selectGoogleAnalyticsPropertyAction(tenantId, match);
          if (result.ok && result.data) setGoogleAnalytics(result.data);
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
        onDisconnect={async () => {
          const result = await disconnectGoogleAnalyticsAction(tenantId);
          if (result.ok) {
            setGoogleAnalytics({
              connected: false,
              status: "disconnected",
              accountEmail: "",
              propertyId: null,
              propertyName: null,
              accountId: null,
              lastError: "",
            });
          }
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
      />
    </div>
  );
}
