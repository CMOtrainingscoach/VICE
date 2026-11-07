import type { WebsiteCrawlSettings } from "@/lib/website/crawl-types";

export function emptyWebsiteCrawlSettings(): WebsiteCrawlSettings {
  return {
    sitemapUrl: "",
    crawlFrequency: "weekly",
    lastFetchedAt: null,
    sourceHost: "",
    pageCount: 0,
    memoryCount: 0,
    crawledCount: 0,
  };
}
