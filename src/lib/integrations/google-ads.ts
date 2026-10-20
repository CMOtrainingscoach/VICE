import { GoogleAdsApi } from "google-ads-api";
import { googleOAuthConfigured } from "@/lib/integrations/google-oauth";
import {
  COUNTRY_GEO,
  LANGUAGE_CONSTANT,
  normalizeKeywordIdea,
  type NormalizedKeywordIdea,
} from "@/lib/keywords/normalize";

export type GoogleAdsPublicStatus = {
  configured: boolean;
  /** Legacy API Center token; optional since Cloud-project access (ignored by Google when set). */
  hasLegacyDeveloperToken: boolean;
  hasCustomerId: boolean;
  hasRefreshToken: boolean;
  hasOAuthClient: boolean;
};

export function googleAdsPublicStatus(): GoogleAdsPublicStatus {
  const hasLegacyDeveloperToken = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
  const hasCustomerId = Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID?.trim());
  const hasRefreshToken = Boolean(process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim());
  const hasOAuthClient = googleOAuthConfigured();
  return {
    configured: hasCustomerId && hasRefreshToken && hasOAuthClient,
    hasLegacyDeveloperToken,
    hasCustomerId,
    hasRefreshToken,
    hasOAuthClient,
  };
}

/**
 * google-ads-api always sends a `developer-token` header. An empty value yields
 * DEVELOPER_TOKEN_PARAMETER_MISSING. With Cloud-project access the token value is
 * ignored; a placeholder satisfies the required header until client libraries omit it.
 */
const GOOGLE_ADS_DEVELOPER_TOKEN_PLACEHOLDER = "0000000000000000000000";

function googleAdsDeveloperTokenForClient(): string {
  const fromEnv = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return GOOGLE_ADS_DEVELOPER_TOKEN_PLACEHOLDER;
}

/** google-ads-api / gRPC failures are often plain objects, not Error instances. */
export function formatGoogleAdsError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.trim();
    return msg || "Google Ads API-fout";
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const errors = record.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((entry) => {
          if (!entry || typeof entry !== "object") return String(entry);
          const row = entry as Record<string, unknown>;
          const message = typeof row.message === "string" ? row.message : "";
          const code =
            row.error_code && typeof row.error_code === "object"
              ? JSON.stringify(row.error_code)
              : "";
          return [message, code].filter(Boolean).join(" — ");
        })
        .filter(Boolean)
        .join(" | ");
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }
  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}") return json;
  } catch {
    /* ignore */
  }
  return "Keywordonderzoek mislukt (onbekende Google Ads-fout)";
}

function adsClient() {
  const status = googleAdsPublicStatus();
  if (!status.configured) {
    throw new Error("Google Ads keyword planning is niet geconfigureerd in de omgeving.");
  }
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    developer_token: googleAdsDeveloperTokenForClient(),
  });
}

function adsCustomer() {
  const client = adsClient();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, "").trim();
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "").trim();
  return client.Customer({
    customer_id: customerId,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!.trim(),
    login_customer_id: loginCustomerId || undefined,
  });
}

export async function resolveGeoTargetConstants(
  countryCode: string,
  city?: string | null,
): Promise<string[]> {
  const country = countryCode.toUpperCase();
  const countryGeo = COUNTRY_GEO[country];
  if (!countryGeo) throw new Error(`Land ${countryCode} wordt nog niet ondersteund (BE/NL).`);

  const targets = [countryGeo];
  const cityName = city?.trim();
  if (!cityName) return targets;

  const customer = adsCustomer();
  const escaped = cityName.replace(/'/g, "\\'");
  const rows = await customer.query(`
    SELECT geo_target_constant.resource_name, geo_target_constant.name
    FROM geo_target_constant
    WHERE geo_target_constant.country_code = '${country}'
      AND geo_target_constant.target_type = 'City'
      AND geo_target_constant.name LIKE '%${escaped}%'
    LIMIT 5
  `);

  const hit = rows.find((row) => {
    const name = String(row.geo_target_constant?.name ?? "").toLowerCase();
    return name.includes(cityName.toLowerCase());
  });
  const resource = hit?.geo_target_constant?.resource_name;
  if (resource) targets.push(String(resource));
  return targets;
}

export async function generateKeywordIdeas(input: {
  seeds: string[];
  countryCode: string;
  city?: string | null;
  language: string;
  siteUrl?: string | null;
  limit?: number;
}): Promise<NormalizedKeywordIdea[]> {
  const seeds = [...new Set(input.seeds.map((s) => s.trim()).filter(Boolean))].slice(0, 15);
  if (seeds.length === 0) throw new Error("Voeg minstens één seed-term toe.");

  const customer = adsCustomer();
  const geoTargetConstants = await resolveGeoTargetConstants(input.countryCode, input.city);
  const languageConstant =
    LANGUAGE_CONSTANT[input.language.slice(0, 2).toLowerCase()] ?? LANGUAGE_CONSTANT.nl;

  const siteUrl = input.siteUrl?.trim();
  const request = {
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, "").trim(),
    language: languageConstant,
    geo_target_constants: geoTargetConstants,
    include_adult_keywords: false,
    keyword_plan_network: "GOOGLE_SEARCH",
    page_size: Math.min(input.limit ?? 300, 500),
    ...(siteUrl
      ? { keyword_and_url_seed: { url: siteUrl, keywords: seeds } }
      : { keyword_seed: { keywords: seeds } }),
  };

  let response;
  try {
    response = await customer.keywordPlanIdeas.generateKeywordIdeas(
      request as Parameters<typeof customer.keywordPlanIdeas.generateKeywordIdeas>[0],
    );
  } catch (error) {
    throw new Error(formatGoogleAdsError(error));
  }

  const ideas = response.results ?? [];
  const out: NormalizedKeywordIdea[] = [];
  const seen = new Set<string>();
  for (const idea of ideas) {
    const normalized = normalizeKeywordIdea({
      text: idea.text,
      keyword_idea_metrics: idea.keyword_idea_metrics,
    });
    if (!normalized) continue;
    const key = normalized.keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);
}
