import OpenAI from "openai";
import { PORTER_FORCE_META, type PorterForceKey } from "@/lib/porter/constants";
import { buildPorterIndustrySearchContext } from "@/lib/porter/market-scope";
import type { PorterResearchContext } from "@/lib/porter/build-research-context";
import { resolvePorterResearchModel } from "@/lib/openai/models";
import {
  isPublicHttpsUrl,
  mergeHits,
  normalizeWebUrl,
  pestelWebResearchConfigured,
  type PestelWebHit,
} from "@/lib/pestel/pestel-web-evidence";

export type PorterWebHit = PestelWebHit;

export { pestelWebResearchConfigured as porterWebResearchConfigured };

function publisherFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildSearchQueries(forceKey: PorterForceKey, ctx: PorterResearchContext): string[] {
  const geo = ctx.scope.geo_markets.join(" ");
  const industry = buildPorterIndustrySearchContext({
    tenantName: ctx.tenant.name,
    marketSector: ctx.scope.market_sector,
    offeringDescription: ctx.scope.offering_description,
    clientSegment: ctx.scope.client_segment,
  });
  if (!industry) {
    throw new Error(
      "Marktafbakening onvolledig: vul sector en aanbod in vóór AI-onderzoek.",
    );
  }
  const meta = PORTER_FORCE_META[forceKey];
  const year = new Date().getFullYear();
  const rq = ctx.scope.research_question.trim();
  const queries = [
    `Porter Five Forces ${meta.label} ${industry} ${geo} België ${year}`,
    `concurrentiedruk ${meta.shortLabel} ${industry} ${geo} markt ${year}`,
    rq ? `${rq} ${meta.shortLabel} ${industry}` : `${meta.question} ${industry} ${geo}`,
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()))].slice(0, 3);
}

async function searchTavily(query: string): Promise<PorterWebHit[]> {
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

async function searchSerper(query: string): Promise<PorterWebHit[]> {
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

async function searchOpenAIWeb(query: string, openai: OpenAI): Promise<PorterWebHit[]> {
  const country = (process.env.VICE_PESTEL_WEB_SEARCH_COUNTRY ?? "BE").toUpperCase();
  const model = resolvePorterResearchModel();

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
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "user",
        content: `Zoek actuele bronnen over: ${query}`,
      },
    ],
  });

  const hits: PorterWebHit[] = [];
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

async function fetchUrlTextSnippet(url: string, maxChars = 2500): Promise<string> {
  if (!isPublicHttpsUrl(url)) return "";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "VICE-Porter-Research/1.0",
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

export async function fetchPorterWebEvidence(input: {
  forceKey: PorterForceKey;
  context: PorterResearchContext;
}): Promise<PorterWebHit[]> {
  if (!pestelWebResearchConfigured()) {
    throw new Error(
      "Live webonderzoek niet geconfigureerd: zet TAVILY_API_KEY, SERPER_API_KEY of OPENAI_API_KEY.",
    );
  }

  const queries = buildSearchQueries(input.forceKey, input.context);
  let hits: PorterWebHit[] = [];
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
      `Geen webresultaten voor ${PORTER_FORCE_META[input.forceKey].shortLabel}. Verfijn de afbakening of controleer Tavily.`,
    );
  }

  return hits.slice(0, 20);
}

export function serializePorterWebEvidenceForPrompt(hits: PorterWebHit[]): string {
  const lines = [
    "# Live webonderzoek",
    "Gebruik ALLEEN onderstaande URLs voor website-bronnen. Excerpt moet uit het fragment komen.",
    "",
  ];
  for (const h of hits) {
    lines.push(`## ${h.url}`, `Titel: ${h.title}`, "Fragment:", h.snippet, "");
  }
  return lines.join("\n");
}

export function allowedPorterWebUrlSet(hits: PorterWebHit[]): Set<string> {
  return new Set(hits.map((h) => normalizeWebUrl(h.url)));
}
