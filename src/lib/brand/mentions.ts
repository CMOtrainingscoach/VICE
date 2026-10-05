import { isPublicHttpsUrl, normalizeWebUrl } from "@/lib/pestel/pestel-web-evidence";

export type BrandMention = { url: string; title: string; snippet: string; publisher: string };

function publisher(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function brandSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim() || process.env.SERPER_API_KEY?.trim());
}

export async function searchBrandMentions(query: string): Promise<BrandMention[]> {
  if (!brandSearchConfigured()) {
    throw new Error("Publieke zoekopdracht is niet geconfigureerd. Zet TAVILY_API_KEY of SERPER_API_KEY. De audit gaat zonder die vermeldingen verder.");
  }
  if (process.env.TAVILY_API_KEY?.trim()) return searchTavily(query);
  return searchSerper(query);
}

async function searchTavily(query: string): Promise<BrandMention[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 6,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Zoeken mislukte (${res.status}). De rest van de audit blijft staan.`);
  const data = (await res.json()) as { results?: { url?: string; title?: string; content?: string }[] };
  return mapHits(data.results ?? []);
}

async function searchSerper(query: string): Promise<BrandMention[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY ?? "" },
    body: JSON.stringify({ q: query, num: 6 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Zoeken mislukte (${res.status}). De rest van de audit blijft staan.`);
  const data = (await res.json()) as { organic?: { link?: string; title?: string; snippet?: string }[] };
  return mapHits((data.organic ?? []).map((item) => ({ url: item.link, title: item.title, content: item.snippet })));
}

function mapHits(rows: { url?: string; title?: string; content?: string }[]): BrandMention[] {
  const seen = new Set<string>();
  const hits: BrandMention[] = [];
  for (const row of rows) {
    if (!row.url || !isPublicHttpsUrl(row.url)) continue;
    const url = normalizeWebUrl(row.url);
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({
      url,
      title: (row.title || publisher(url)).slice(0, 180),
      snippet: (row.content || "").trim().slice(0, 500),
      publisher: publisher(url),
    });
  }
  return hits;
}
