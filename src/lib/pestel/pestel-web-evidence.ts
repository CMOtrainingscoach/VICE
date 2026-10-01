import OpenAI from "openai";
import {
  PESTEL_DIMENSION_META,
  type PestelDimension,
} from "@/lib/pestel/constants";
import { resolvePestelResearchModel } from "@/lib/openai/models";
import type { PestelResearchContext } from "@/lib/pestel/build-research-context";
import { buildIndustrySearchContext } from "@/lib/pestel/market-scope";

export type PestelWebHit = {
  url: string;
  title: string;
  snippet: string;
  publisher: string;
};

export function normalizeWebUrl(url: string): string {
  try {
    const u = new URL(url);
    u.protocol = "https:";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.endsWith("/") && path.length > 1) {
      path = path.slice(0, -1);
    }
    u.pathname = path;
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function isPublicHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost"
      || host.endsWith(".local")
      || host.startsWith("127.")
      || host.startsWith("10.")
      || host.startsWith("192.168.")
      || host.startsWith("169.254.")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function publisherFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildSearchQueries(
  dimension: PestelDimension,
  ctx: PestelResearchContext,
): string[] {
  const geo = ctx.scope.geo_markets.join(" ");
  const industry = buildIndustrySearchContext(ctx);
  if (!industry) {
    throw new Error(
      "Marktafbakening onvolledig: vul vakgebied/branche en diensten in vóór webonderzoek.",
    );
  }
  const meta = PESTEL_DIMENSION_META[dimension];
  const year = new Date().getFullYear();
  const rq = ctx.scope.research_question.trim();
  const queries = [
    `markttrends ${industry} ${geo} België ${year} ${meta.label} ${meta.hint}`,
    `sector ${industry} ${meta.label} ontwikkelingen regelgeving ${geo} ${year}`,
    rq
      ? `${rq} ${industry} ${geo} ${year}`
      : `toekomst ${industry} ${geo} ${meta.label} prognose ${year}`,
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))].slice(0, 3);
}

function mergeHits(existing: PestelWebHit[], incoming: PestelWebHit[]): PestelWebHit[] {
  const byUrl = new Map<string, PestelWebHit>();
  for (const hit of [...existing, ...incoming]) {
    if (!isPublicHttpsUrl(hit.url)) continue;
    const key = normalizeWebUrl(hit.url);
    const prev = byUrl.get(key);
    if (!prev || hit.snippet.length > prev.snippet.length) {
      byUrl.set(key, {
        url: key,
        title: hit.title.trim() || publisherFromUrl(key),
        snippet: hit.snippet.trim().slice(0, 4000),
        publisher: hit.publisher.trim() || publisherFromUrl(key),
      });
    }
  }
  return [...byUrl.values()];
}

async function searchTavily(query: string): Promise<PestelWebHit[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tavily zoeken mislukt (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    results?: { url?: string; title?: string; content?: string }[];
  };

  return (data.results ?? [])
    .filter((r) => r.url && isPublicHttpsUrl(r.url))
    .map((r) => ({
      url: normalizeWebUrl(r.url!),
      title: r.title?.trim() || publisherFromUrl(r.url!),
      snippet: (r.content ?? r.title ?? "").trim().slice(0, 4000),
      publisher: publisherFromUrl(r.url!),
    }));
}

async function searchSerper(query: string): Promise<PestelWebHit[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: query,
      gl: (process.env.VICE_PESTEL_WEB_SEARCH_COUNTRY ?? "be").toLowerCase(),
      num: 8,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Serper zoeken mislukt (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    organic?: { link?: string; title?: string; snippet?: string }[];
  };

  return (data.organic ?? [])
    .filter((r) => r.link && isPublicHttpsUrl(r.link))
    .map((r) => ({
      url: normalizeWebUrl(r.link!),
      title: r.title?.trim() || publisherFromUrl(r.link!),
      snippet: (r.snippet ?? r.title ?? "").trim().slice(0, 4000),
      publisher: publisherFromUrl(r.link!),
    }));
}

async function searchOpenAIWeb(query: string, openai: OpenAI): Promise<PestelWebHit[]> {
  const country = (process.env.VICE_PESTEL_WEB_SEARCH_COUNTRY ?? "BE").toUpperCase();
  const model = resolvePestelResearchModel();

  const response = await openai.responses.create({
    model,
    tools: [
      {
        type: "web_search",
        external_web_access: true,
        search_context_size: "medium",
        user_location: { type: "approximate", country },
      },
    ],
    include: ["web_search_call.action.sources", "web_search_call.results"],
    input: [
      {
        role: "user",
        content: `Voer een websearch uit voor actuele, feitelijke bronnen over: ${query}. 
Geen samenvatting schrijven — alleen zoeken en pagina's openen.`,
      },
    ],
  });

  const hits: PestelWebHit[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "web_search_call") continue;
    const action = item.action;
    if (action.type === "search" && action.sources) {
      for (const src of action.sources) {
        if (src.type === "url" && isPublicHttpsUrl(src.url)) {
          hits.push({
            url: normalizeWebUrl(src.url),
            title: publisherFromUrl(src.url),
            snippet: "",
            publisher: publisherFromUrl(src.url),
          });
        }
      }
    }
  }

  return hits;
}

export async function fetchUrlTextSnippet(url: string, maxChars = 2500): Promise<string> {
  if (!isPublicHttpsUrl(url)) return "";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "VICE-PESTEL-Research/1.0 (+https://github.com/CMOtrainingscoach/VICE)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

async function enrichLinkedWebsites(
  hits: PestelWebHit[],
  ctx: PestelResearchContext,
): Promise<PestelWebHit[]> {
  let merged = hits;
  for (const input of ctx.staticInputs) {
    if (input.kind !== "website" || !input.url || !isPublicHttpsUrl(input.url)) continue;
    const url = normalizeWebUrl(input.url);
    const snippet =
      input.excerpt.trim()
      || (await fetchUrlTextSnippet(url))
      || input.label;
    merged = mergeHits(merged, [
      {
        url,
        title: input.label || publisherFromUrl(url),
        snippet,
        publisher: publisherFromUrl(url),
      },
    ]);
  }
  return merged;
}

export function pestelWebResearchConfigured(): boolean {
  return Boolean(
    process.env.TAVILY_API_KEY?.trim()
      || process.env.SERPER_API_KEY?.trim()
      || process.env.OPENAI_API_KEY?.trim(),
  );
}

export async function fetchPestelWebEvidence(input: {
  dimension: PestelDimension;
  context: PestelResearchContext;
}): Promise<PestelWebHit[]> {
  if (!pestelWebResearchConfigured()) {
    throw new Error(
      "Live webonderzoek niet geconfigureerd: zet TAVILY_API_KEY (aanbevolen), SERPER_API_KEY of OPENAI_API_KEY in Vercel/.env.local",
    );
  }

  const queries = buildSearchQueries(input.dimension, input.context);
  let hits: PestelWebHit[] = [];
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

  for (const query of queries) {
    if (process.env.TAVILY_API_KEY?.trim()) {
      hits = mergeHits(hits, await searchTavily(query));
    } else if (process.env.SERPER_API_KEY?.trim()) {
      hits = mergeHits(hits, await searchSerper(query));
    } else if (openai) {
      hits = mergeHits(hits, await searchOpenAIWeb(query, openai));
    }
  }

  hits = await enrichLinkedWebsites(hits, input.context);

  for (let i = 0; i < hits.length; i += 1) {
    if (hits[i].snippet.length >= 40) continue;
    const fetched = await fetchUrlTextSnippet(hits[i].url);
    if (fetched.length >= 40) {
      hits[i] = { ...hits[i], snippet: fetched };
    }
  }

  hits = hits.filter((h) => h.snippet.length >= 20);

  if (hits.length === 0) {
    throw new Error(
      `Geen live webresultaten voor ${PESTEL_DIMENSION_META[input.dimension].label}. Probeer TAVILY_API_KEY of verfijn de afbakening.`,
    );
  }

  return hits.slice(0, 24);
}

export function serializeWebEvidenceForPrompt(hits: PestelWebHit[]): string {
  const lines = [
    "# Live webonderzoek (opgehaald vóór analyse)",
    "Gebruik ALLEEN onderstaande URLs voor website-factbronnen. Excerpt moet letterlijk uit het fragment komen.",
    "",
  ];
  for (const h of hits) {
    lines.push(
      `## ${h.url}`,
      `Titel: ${h.title}`,
      `Uitgever/domein: ${h.publisher}`,
      "Fragment:",
      h.snippet,
      "",
    );
  }
  return lines.join("\n");
}

export function allowedWebUrlSet(hits: PestelWebHit[]): Set<string> {
  return new Set(hits.map((h) => normalizeWebUrl(h.url)));
}
