import {
  normalizeDataforSeoKeyword,
  type NormalizedKeywordIdea,
} from "@/lib/keywords/normalize";

const API_ROOT = "https://api.dataforseo.com/v3";

/** Google Ads location codes (DataForSEO keywords_data/google_ads). */
export const DATAFORSEO_COUNTRY_LOCATION: Record<string, number> = {
  BE: 2056,
  NL: 2528,
};

export type DataforSeoPublicStatus = {
  configured: boolean;
  loginSet: boolean;
  passwordSet: boolean;
};

export function dataforSeoPublicStatus(): DataforSeoPublicStatus {
  const loginSet = Boolean(process.env.DATAFORSEO_LOGIN?.trim());
  const passwordSet = Boolean(process.env.DATAFORSEO_PASSWORD?.trim());
  return {
    loginSet,
    passwordSet,
    configured: loginSet && passwordSet,
  };
}

export function formatDataforSeoError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Keywordonderzoek via DataForSEO mislukt";
}

function credentials(): { login: string; password: string } | null {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) return null;
  return { login, password };
}

type DataforSeoTaskEnvelope = {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: unknown[];
  }>;
};

async function postLive(path: string, task: Record<string, unknown>): Promise<unknown[]> {
  const creds = credentials();
  if (!creds) {
    throw new Error(
      "DataForSEO is niet geconfigureerd. Zet DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD in de omgeving (Instellingen).",
    );
  }

  const auth = Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
  const response = await fetch(`${API_ROOT}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([task]),
  });

  const text = await response.text();
  let payload: DataforSeoTaskEnvelope;
  try {
    payload = JSON.parse(text) as DataforSeoTaskEnvelope;
  } catch {
    throw new Error(`DataForSEO antwoord ongeldig (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(payload.status_message ?? `DataForSEO HTTP ${response.status}`);
  }
  if (payload.status_code != null && payload.status_code !== 20000) {
    throw new Error(payload.status_message ?? `DataForSEO status ${payload.status_code}`);
  }

  const taskRow = payload.tasks?.[0];
  if (!taskRow) throw new Error("DataForSEO: lege tasks-respons");
  if (taskRow.status_code != null && taskRow.status_code !== 20000) {
    throw new Error(taskRow.status_message ?? `DataForSEO taak ${taskRow.status_code}`);
  }

  return Array.isArray(taskRow.result) ? taskRow.result : [];
}

export function buildDataforSeoLocation(input: {
  countryCode: string;
  scope: "national" | "local";
  city?: string | null;
}): { location_code?: number; location_name?: string } {
  const country = input.countryCode.toUpperCase();
  if (input.scope === "local" && input.city?.trim()) {
    const countryName = country === "NL" ? "Netherlands" : country === "BE" ? "Belgium" : country;
    return { location_name: `${input.city.trim()},${countryName}` };
  }
  const location_code = DATAFORSEO_COUNTRY_LOCATION[country];
  if (!location_code) throw new Error(`Land ${country} wordt nog niet ondersteund (BE/NL).`);
  return { location_code };
}

function languageCode(raw: string): string {
  const code = raw.slice(0, 2).toLowerCase();
  return code || "nl";
}

async function keywordsForKeywords(taskBase: Record<string, unknown>, seeds: string[]): Promise<unknown[]> {
  if (seeds.length === 0) return [];
  return postLive("keywords_data/google_ads/keywords_for_keywords/live", {
    ...taskBase,
    keywords: seeds.slice(0, 20),
    sort_by: "search_volume",
    search_partners: false,
    include_adult_keywords: false,
  });
}

async function keywordsForSite(taskBase: Record<string, unknown>, siteUrl: string): Promise<unknown[]> {
  const target = siteUrl.trim();
  if (!target) return [];
  return postLive("keywords_data/google_ads/keywords_for_site/live", {
    ...taskBase,
    target,
    sort_by: "search_volume",
    search_partners: false,
    include_adult_keywords: false,
  });
}

export async function generateKeywordIdeas(input: {
  seeds: string[];
  countryCode: string;
  city?: string | null;
  scope?: "national" | "local";
  language: string;
  siteUrl?: string | null;
  limit?: number;
}): Promise<NormalizedKeywordIdea[]> {
  const seeds = [...new Set(input.seeds.map((s) => s.trim()).filter(Boolean))].slice(0, 20);
  const siteUrl = input.siteUrl?.trim();
  if (seeds.length === 0 && !siteUrl) {
    throw new Error("Voeg minstens één seed-term toe.");
  }

  const location = buildDataforSeoLocation({
    countryCode: input.countryCode,
    scope: input.scope ?? (input.city?.trim() ? "local" : "national"),
    city: input.city,
  });

  const taskBase: Record<string, unknown> = {
    ...location,
    language_code: languageCode(input.language),
  };

  const batches: unknown[][] = [];
  if (seeds.length > 0) {
    batches.push(await keywordsForKeywords(taskBase, seeds));
  }
  if (siteUrl) {
    batches.push(await keywordsForSite(taskBase, siteUrl));
  }

  const out: NormalizedKeywordIdea[] = [];
  const seen = new Set<string>();
  const max = Math.min(input.limit ?? 300, 2000);

  for (const batch of batches) {
    for (const row of batch) {
      const normalized = normalizeDataforSeoKeyword(row as Record<string, unknown>);
      if (!normalized) continue;
      const key = normalized.keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }

  return out.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);
}
