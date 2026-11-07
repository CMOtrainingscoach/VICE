const MAX_SITEMAP_FETCHES = 40;
const MAX_URLS = 2500;
const FETCH_TIMEOUT_MS = 20_000;

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const loc = match[1]?.trim();
    if (loc) locs.push(loc);
  }
  return locs;
}

function isSitemapIndex(xml: string, locs: string[]): boolean {
  if (/<sitemapindex[\s>]/i.test(xml)) return true;
  if (locs.length === 0) return false;
  const xmlish = locs.filter((u) => /\.xml(\?|$)/i.test(u)).length;
  return xmlish >= Math.max(1, Math.floor(locs.length * 0.6));
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml,*/*",
      "User-Agent": "VICE-WebsiteCrawl/1.0",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Sitemap ophalen mislukt (${res.status}): ${url}`);
  }
  return res.text();
}

export async function discoverUrlsFromSitemap(entryUrl: string): Promise<string[]> {
  const normalized = entryUrl.trim();
  if (!normalized.startsWith("http")) {
    throw new Error("De sitemap-URL moet met https:// beginnen.");
  }

  const queue = [normalized];
  const seenSitemaps = new Set<string>();
  const urls = new Set<string>();

  while (queue.length > 0 && seenSitemaps.size < MAX_SITEMAP_FETCHES && urls.size < MAX_URLS) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    const xml = await fetchXml(sitemapUrl);
    const locs = extractLocs(xml);

    if (isSitemapIndex(xml, locs)) {
      for (const loc of locs) {
        if (!seenSitemaps.has(loc) && queue.length + seenSitemaps.size < MAX_SITEMAP_FETCHES) {
          queue.push(loc);
        }
      }
    } else {
      for (const loc of locs) {
        if (!/\.xml(\?|$)/i.test(loc)) urls.add(loc);
        if (urls.size >= MAX_URLS) break;
      }
    }
  }

  if (urls.size === 0) {
    throw new Error("Geen pagina-URL's gevonden in de sitemap.");
  }

  return [...urls].sort((a, b) => a.localeCompare(b, "nl"));
}
