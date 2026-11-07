"use server";

import { revalidatePath } from "next/cache";
import {
  WEBSITE_CRAWL_MIGRATION,
  type WebsiteCrawlPage,
  type WebsiteCrawlSettings,
} from "@/lib/website/crawl-types";
import { crawlUrlsInPool } from "@/lib/website/page-meta";
import { discoverUrlsFromSitemap } from "@/lib/website/sitemap";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /tenant_website_crawl|get_website_crawl|list_website_crawl|merge_website|save_website_crawl|schema cache|does not exist|Could not find the function/i;

function migrationMsg(message: string) {
  return MISSING.test(message) ? WEBSITE_CRAWL_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function parseSettings(raw: unknown): WebsiteCrawlSettings {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const freq = String(row.crawlFrequency ?? "weekly");
  return {
    sitemapUrl: String(row.sitemapUrl ?? ""),
    crawlFrequency: freq === "manual" || freq === "monthly" ? freq : "weekly",
    lastFetchedAt: row.lastFetchedAt ? String(row.lastFetchedAt) : null,
    sourceHost: String(row.sourceHost ?? ""),
    pageCount: Number(row.pageCount ?? 0),
    memoryCount: Number(row.memoryCount ?? 0),
    crawledCount: Number(row.crawledCount ?? 0),
  };
}

function parsePages(raw: unknown): WebsiteCrawlPage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      url: String(row.url ?? ""),
      urlPath: String(row.urlPath ?? ""),
      pageType: String(row.pageType ?? "page"),
      language: String(row.language ?? ""),
      crawlState:
        row.crawlState === "pending" ||
        row.crawlState === "crawled" ||
        row.crawlState === "failed" ||
        row.crawlState === "skipped"
          ? row.crawlState
          : "pending",
      inMemory: Boolean(row.inMemory),
      archived: Boolean(row.archived),
      title: String(row.title ?? ""),
      httpStatus: row.httpStatus != null ? Number(row.httpStatus) : null,
      lastCrawledAt: row.lastCrawledAt ? String(row.lastCrawledAt) : null,
    };
  });
}

function revalidate(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/website`);
}

export async function loadWebsiteCrawlAction(tenantId: string): Promise<
  ActionResult<{ settings: WebsiteCrawlSettings; pages: WebsiteCrawlPage[] }>
> {
  try {
    const supabase = await authed();
    const [stateRes, pagesRes] = await Promise.all([
      supabase.schema("app").rpc("get_website_crawl_state", { p_tenant_id: tenantId }),
      supabase.schema("app").rpc("list_website_crawl_pages", {
        p_tenant_id: tenantId,
        p_search: "",
        p_page_type: "",
        p_language: "",
        p_crawl_state: "",
        p_include_archived: false,
      }),
    ]);
    if (stateRes.error) return { ok: false, error: migrationMsg(stateRes.error.message) };
    if (pagesRes.error) return { ok: false, error: migrationMsg(pagesRes.error.message) };
    return {
      ok: true,
      data: {
        settings: parseSettings(stateRes.data),
        pages: parsePages(pagesRes.data),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Laden mislukt" };
  }
}

export async function saveAndFetchWebsiteSitemapAction(
  tenantId: string,
  input: { sitemapUrl: string; crawlFrequency: string },
): Promise<ActionResult<{ settings: WebsiteCrawlSettings; pages: WebsiteCrawlPage[] }>> {
  try {
    const supabase = await authed();
    const save = await supabase.schema("app").rpc("save_website_crawl_settings", {
      p_tenant_id: tenantId,
      p_sitemap_url: input.sitemapUrl.trim(),
      p_crawl_frequency: input.crawlFrequency,
    });
    if (save.error) return { ok: false, error: migrationMsg(save.error.message) };

    const urls = await discoverUrlsFromSitemap(input.sitemapUrl.trim());
    const snapshots = await crawlUrlsInPool(urls, 6);
    const now = new Date().toISOString();

    const payload = urls.map((url) => {
      const snap = snapshots.get(url);
      const crawled = snap?.crawlState === "crawled";
      return {
        url,
        urlPath: snap?.urlPath ?? "/",
        pageType: snap?.pageType ?? "page",
        language: snap?.language ?? "",
        crawlState: snap?.crawlState ?? "failed",
        title: snap?.title ?? "",
        httpStatus: snap?.httpStatus != null ? String(snap.httpStatus) : "",
        lastCrawledAt: now,
        inMemory: crawled,
      };
    });

    const merge = await supabase.schema("app").rpc("merge_website_crawl_pages", {
      p_tenant_id: tenantId,
      p_pages: payload,
    });
    if (merge.error) return { ok: false, error: migrationMsg(merge.error.message) };

    const pagesRes = await supabase.schema("app").rpc("list_website_crawl_pages", {
      p_tenant_id: tenantId,
      p_search: "",
      p_page_type: "",
      p_language: "",
      p_crawl_state: "",
      p_include_archived: false,
    });
    if (pagesRes.error) return { ok: false, error: migrationMsg(pagesRes.error.message) };
    revalidate(tenantId);
    return {
      ok: true,
      data: {
        settings: parseSettings(merge.data),
        pages: parsePages(pagesRes.data),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sitemap ophalen mislukt",
    };
  }
}

export async function recrawlWebsitePagesAction(
  tenantId: string,
): Promise<ActionResult<{ settings: WebsiteCrawlSettings; pages: WebsiteCrawlPage[] }>> {
  try {
    const supabase = await authed();
    const pagesRes = await supabase.schema("app").rpc("list_website_crawl_pages", {
      p_tenant_id: tenantId,
      p_search: "",
      p_page_type: "",
      p_language: "",
      p_crawl_state: "",
      p_include_archived: false,
    });
    if (pagesRes.error) return { ok: false, error: migrationMsg(pagesRes.error.message) };
    const existing = parsePages(pagesRes.data);
    const urls = existing.map((p) => p.url).filter(Boolean);
    if (urls.length === 0) {
      return { ok: false, error: "Geen pagina's om opnieuw te crawlen. Haal eerst een sitemap op." };
    }

    const snapshots = await crawlUrlsInPool(urls, 6);
    const now = new Date().toISOString();
    const payload = urls.map((url) => {
      const snap = snapshots.get(url);
      return {
        url,
        urlPath: snap?.urlPath ?? "/",
        pageType: snap?.pageType ?? "page",
        language: snap?.language ?? "",
        crawlState: snap?.crawlState ?? "failed",
        title: snap?.title ?? "",
        httpStatus: snap?.httpStatus != null ? String(snap.httpStatus) : "",
        lastCrawledAt: now,
        inMemory: false,
      };
    });

    const merge = await supabase.schema("app").rpc("merge_website_crawl_pages", {
      p_tenant_id: tenantId,
      p_pages: payload,
    });
    if (merge.error) return { ok: false, error: migrationMsg(merge.error.message) };

    const fresh = await supabase.schema("app").rpc("list_website_crawl_pages", {
      p_tenant_id: tenantId,
      p_search: "",
      p_page_type: "",
      p_language: "",
      p_crawl_state: "",
      p_include_archived: false,
    });
    if (fresh.error) return { ok: false, error: migrationMsg(fresh.error.message) };
    revalidate(tenantId);
    return {
      ok: true,
      data: {
        settings: parseSettings(merge.data),
        pages: parsePages(fresh.data),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Her-crawl mislukt" };
  }
}

export async function setWebsitePageInMemoryAction(
  tenantId: string,
  pageId: string,
  inMemory: boolean,
): Promise<ActionResult<{ settings: WebsiteCrawlSettings }>> {
  try {
    const supabase = await authed();
    const result = await supabase.schema("app").rpc("set_website_page_in_memory", {
      p_tenant_id: tenantId,
      p_page_id: pageId,
      p_in_memory: inMemory,
    });
    if (result.error) return { ok: false, error: migrationMsg(result.error.message) };
    revalidate(tenantId);
    return { ok: true, data: { settings: parseSettings(result.data) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Opslaan mislukt" };
  }
}
