import type { WebsitePageType } from "@/lib/website/crawl-types";

const LANG_PREFIX = /^\/(nl|en|fr|de|es|it|pt)(\/|$)/i;

export function urlPathFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname || "/";
    return path + (u.search || "");
  } catch {
    return url;
  }
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function guessLanguage(path: string, _host: string): string {
  const m = path.match(LANG_PREFIX);
  if (m?.[1]) return m[1].toLowerCase();
  return "";
}

export function guessPageType(path: string): WebsitePageType {
  const p = path.toLowerCase();
  if (p === "/" || p === "") return "homepage";
  if (/contact|contacteer|kontakt/.test(p)) return "contact";
  if (/over-ons|about|wie-zijn|team/.test(p)) return "about";
  if (/blog|nieuws|news|artikel|article|insights|resources/.test(p)) return "blog";
  if (/diensten|services|marketing|branding|seo|agency|bureau|oplossing/.test(p)) return "service";
  if (/landing|campagn|lp\//.test(p)) return "landing";
  return "page";
}

const TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i;

export async function fetchPageSnapshot(url: string): Promise<{
  title: string;
  httpStatus: number;
  crawlState: "crawled" | "failed";
}> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": "VICE-WebsiteCrawl/1.0" },
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
      redirect: "follow",
    });
    const status = res.status;
    if (!res.ok) {
      return { title: "", httpStatus: status, crawlState: "failed" };
    }
    const html = await res.text();
    const slice = html.slice(0, 80_000);
    const titleMatch = slice.match(TITLE_RE);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    return { title: title.slice(0, 500), httpStatus: status, crawlState: "crawled" };
  } catch {
    return { title: "", httpStatus: 0, crawlState: "failed" };
  }
}

export async function crawlUrlsInPool(
  urls: string[],
  concurrency = 6,
  onProgress?: (done: number, total: number) => void,
): Promise<
  Map<
    string,
    { title: string; httpStatus: number; crawlState: "crawled" | "failed"; urlPath: string; pageType: WebsitePageType; language: string }
  >
> {
  const out = new Map<
    string,
    { title: string; httpStatus: number; crawlState: "crawled" | "failed"; urlPath: string; pageType: WebsitePageType; language: string }
  >();
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const url = urls[i];
      const path = urlPathFromUrl(url);
      const host = hostFromUrl(url);
      const snap = await fetchPageSnapshot(url);
      out.set(url, {
        ...snap,
        urlPath: path,
        pageType: guessPageType(path),
        language: guessLanguage(path, host),
      });
      done++;
      onProgress?.(done, urls.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
