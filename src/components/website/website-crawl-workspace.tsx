"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemoryToggle } from "@/components/website/memory-toggle";
import {
  PAGE_TYPE_LABELS,
  type WebsiteCrawlPage,
  type WebsiteCrawlSettings,
} from "@/lib/website/crawl-types";
import {
  recrawlWebsitePagesAction,
  saveAndFetchWebsiteSitemapAction,
  setWebsitePageInMemoryAction,
} from "@/modules/website/crawl-actions";

const CRAWL_TIME_ZONE = "Europe/Brussels";

function formatWhen(iso: string | null): string {
  if (!iso) return "Nog niet opgehaald";
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: CRAWL_TIME_ZONE,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function defaultSitemap(website: string): string {
  const w = website.trim();
  if (!w) return "";
  const base = w.startsWith("http") ? w.replace(/\/$/, "") : `https://${w.replace(/\/$/, "")}`;
  return `${base}/sitemap_index.xml`;
}

export function WebsiteCrawlWorkspace({
  tenantId,
  tenantWebsite,
  initialSettings,
  initialPages,
}: {
  tenantId: string;
  tenantWebsite: string;
  initialSettings: WebsiteCrawlSettings;
  initialPages: WebsiteCrawlPage[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [pages, setPages] = useState(initialPages);
  const [sitemapUrl, setSitemapUrl] = useState(
    initialSettings.sitemapUrl || defaultSitemap(tenantWebsite),
  );
  const [frequency, setFrequency] = useState(settings.crawlFrequency);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ homepage: true, service: true });

  const languages = useMemo(() => {
    const set = new Set(pages.map((p) => p.language).filter(Boolean));
    return [...set].sort();
  }, [pages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((p) => {
      if (typeFilter && p.pageType !== typeFilter) return false;
      if (langFilter && p.language !== langFilter) return false;
      if (stateFilter && p.crawlState !== stateFilter) return false;
      if (!q) return true;
      return p.url.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || p.urlPath.toLowerCase().includes(q);
    });
  }, [pages, search, typeFilter, langFilter, stateFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, WebsiteCrawlPage[]>();
    for (const page of filtered) {
      const key = page.pageType || "page";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(page);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
  }, [filtered]);

  async function saveAndFetch() {
    setBusy("fetch");
    setError("");
    setMessage("");
    const result = await saveAndFetchWebsiteSitemapAction(tenantId, {
      sitemapUrl,
      crawlFrequency: frequency,
    });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setSettings(result.data.settings);
      setPages(result.data.pages);
      setMessage(`${result.data.settings.pageCount} pagina's gevonden; ${result.data.settings.memoryCount} in geheugen.`);
    }
  }

  async function recrawl() {
    setBusy("recrawl");
    setError("");
    setMessage("");
    const result = await recrawlWebsitePagesAction(tenantId);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setSettings(result.data.settings);
      setPages(result.data.pages);
      setMessage("Pagina's opnieuw gecrawld.");
    }
  }

  async function toggleMemory(pageId: string, next: boolean) {
    setBusy(`mem-${pageId}`);
    const result = await setWebsitePageInMemoryAction(tenantId, pageId, next);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, inMemory: next } : p)));
    if (result.data?.settings) setSettings(result.data.settings);
  }

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const memoryEnabled = filtered.filter((p) => p.inMemory).length;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-vice-border bg-vice-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-vice-text">Sitemap</h2>
            <p className="mt-1 text-sm text-vice-text-muted">
              <span className="font-medium text-vice-text">{settings.pageCount} pagina&apos;s</span>
              {settings.sourceHost ? (
                <span> — bron: {settings.sourceHost}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-vice-text-muted" suppressHydrationWarning>
              Laatst opgehaald: {formatWhen(settings.lastFetchedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-md bg-vice-gold/15 px-2.5 py-1 text-xs font-medium text-vice-text">
              Geheugen: {settings.memoryCount} aan
            </span>
            <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void recrawl()}>
              {busy === "recrawl" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Re-crawl
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <Input
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://www.voorbeeld.be/sitemap_index.xml"
            className="font-mono text-sm"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-vice-text-muted">
            Frequentie
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as WebsiteCrawlSettings["crawlFrequency"])}
              className="rounded-md border border-vice-border bg-vice-bg px-2 py-1.5 text-sm text-vice-text"
            >
              <option value="manual">Handmatig</option>
              <option value="weekly">Wekelijks</option>
              <option value="monthly">Maandelijks</option>
            </select>
          </label>
          <Button type="button" disabled={Boolean(busy) || !sitemapUrl.trim()} onClick={() => void saveAndFetch()}>
            {busy === "fetch" ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Bezig…
              </>
            ) : (
              "Opslaan & ophalen"
            )}
          </Button>
        </div>

        {message ? <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-200">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      </section>

      <section className="rounded-lg border border-vice-border bg-vice-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-vice-border p-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter URL's…"
            className="max-w-xs"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-vice-border bg-vice-bg px-2 py-1.5 text-sm text-vice-text"
          >
            <option value="">Alle paginatypen</option>
            {Object.entries(PAGE_TYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value)}
            className="rounded-md border border-vice-border bg-vice-bg px-2 py-1.5 text-sm text-vice-text"
          >
            <option value="">Alle talen</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-md border border-vice-border bg-vice-bg px-2 py-1.5 text-sm text-vice-text"
          >
            <option value="">Alle crawl-statussen</option>
            <option value="crawled">Gecrawld</option>
            <option value="pending">In wacht</option>
            <option value="failed">Mislukt</option>
          </select>
          <p className="ml-auto text-xs text-vice-text-muted">
            {filtered.length} zichtbaar · {memoryEnabled} in geheugen (filter)
          </p>
        </div>

        {pages.length === 0 ? (
          <p className="p-8 text-sm text-vice-text-muted">
            Nog geen pagina&apos;s. Vul een sitemap-URL in en klik op <strong>Opslaan &amp; ophalen</strong>.
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-sm text-vice-text-muted">Geen pagina&apos;s voor dit filter.</p>
        ) : (
          <div className="divide-y divide-vice-border">
            {grouped.map(([type, list]) => {
              const open = openGroups[type] !== false;
              const label = PAGE_TYPE_LABELS[type] ?? type;
              return (
                <div key={type}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-vice-text hover:bg-vice-bg"
                    onClick={() => toggleGroup(type)}
                  >
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    {label}
                    <span className="rounded-md bg-vice-surface-muted px-1.5 py-0.5 text-xs font-normal text-vice-text-muted">
                      {list.length}
                    </span>
                  </button>
                  {open ? (
                    <ul className="border-t border-vice-border">
                      {list.map((page) => (
                        <li
                          key={page.id}
                          className="flex flex-wrap items-center justify-between gap-3 border-b border-vice-border px-4 py-3 last:border-b-0"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            {page.crawlState === "crawled" ? (
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <span className="mt-1 size-4 shrink-0 rounded-full border border-vice-border" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-vice-text">
                                {page.title || page.urlPath || page.url}
                              </p>
                              <p className="truncate font-mono text-xs text-vice-text-muted">{page.urlPath || page.url}</p>
                              <p className="mt-0.5 text-xs text-vice-text-muted">
                                {page.crawlState === "crawled" ? (
                                  <span className="text-emerald-700 dark:text-emerald-300">Gecrawld</span>
                                ) : (
                                  page.crawlState
                                )}
                                {page.httpStatus ? ` · HTTP ${page.httpStatus}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-md bg-vice-gold/10 px-2 py-0.5 text-xs text-vice-text">
                              {PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
                            </span>
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-vice-gold hover:text-vice-text"
                              aria-label="Open pagina"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-vice-text-muted">Geheugen</span>
                              <MemoryToggle
                                checked={page.inMemory}
                                disabled={Boolean(busy)}
                                label={`Geheugen voor ${page.urlPath}`}
                                onChange={(next) => void toggleMemory(page.id, next)}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-vice-text-muted">
        Pagina&apos;s in het geheugen gebruikt VICE later als context voor AI en audits. Automatische wekelijkse crawls
        volgen in een latere versie (nu handmatig ophalen).
      </p>
    </div>
  );
}
