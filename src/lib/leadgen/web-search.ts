export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export async function searchPublicWeb(query: string, maxResults = 10): Promise<WebSearchHit[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        max_results: Math.min(maxResults, 20),
        include_answer: false,
        search_depth: "basic",
      }),
    });
    if (!response.ok) {
      throw new Error(`Tavily zoeken mislukt (${response.status})`);
    }
    const json = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (json.results ?? [])
      .map((row) => ({
        title: String(row.title ?? "").trim(),
        url: String(row.url ?? "").trim(),
        snippet: String(row.content ?? "").trim().slice(0, 500),
      }))
      .filter((row) => row.url.startsWith("http"));
  }

  const serperKey = process.env.SERPER_API_KEY?.trim();
  if (serperKey) {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": serperKey,
      },
      body: JSON.stringify({ q: query, num: Math.min(maxResults, 20) }),
    });
    if (!response.ok) {
      throw new Error(`Serper zoeken mislukt (${response.status})`);
    }
    const json = (await response.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    return (json.organic ?? [])
      .map((row) => ({
        title: String(row.title ?? "").trim(),
        url: String(row.link ?? "").trim(),
        snippet: String(row.snippet ?? "").trim().slice(0, 500),
      }))
      .filter((row) => row.url.startsWith("http"));
  }

  throw new Error("Geen zoekprovider: stel TAVILY_API_KEY of SERPER_API_KEY in.");
}

export function normalizeWebsiteHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}
