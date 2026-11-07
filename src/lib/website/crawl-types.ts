export type WebsiteCrawlFrequency = "manual" | "weekly" | "monthly";

export type WebsiteCrawlState = "pending" | "crawled" | "failed" | "skipped";

export type WebsitePageType =
  | "homepage"
  | "service"
  | "blog"
  | "about"
  | "contact"
  | "landing"
  | "page";

export type WebsiteCrawlSettings = {
  sitemapUrl: string;
  crawlFrequency: WebsiteCrawlFrequency;
  lastFetchedAt: string | null;
  sourceHost: string;
  pageCount: number;
  memoryCount: number;
  crawledCount: number;
};

export type WebsiteCrawlPage = {
  id: string;
  url: string;
  urlPath: string;
  pageType: WebsitePageType | string;
  language: string;
  crawlState: WebsiteCrawlState;
  inMemory: boolean;
  archived: boolean;
  title: string;
  httpStatus: number | null;
  lastCrawledAt: string | null;
};

export const WEBSITE_CRAWL_MIGRATION =
  "Pas migratie 20260330136423_website_crawl.sql toe in de Supabase SQL-editor.";

export const PAGE_TYPE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  service: "Service",
  blog: "Blog",
  about: "Over",
  contact: "Contact",
  landing: "Landingspagina",
  page: "Pagina",
};
