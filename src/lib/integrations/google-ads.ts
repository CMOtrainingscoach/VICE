import { GoogleAdsApi } from "google-ads-api";
import { googleOAuthConfigured } from "@/lib/integrations/google-oauth";
import {
  normalizeAdsCustomerId,
  type PlatformGoogleAdsPublicStatus,
} from "@/lib/integrations/platform-google-ads";
import {
  COUNTRY_GEO,
  LANGUAGE_CONSTANT,
  normalizeKeywordIdea,
  type NormalizedKeywordIdea,
} from "@/lib/keywords/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleAdsPublicStatus = {
  configured: boolean;
  /** Legacy API Center token; optional since Cloud-project access (ignored by Google when set). */
  hasLegacyDeveloperToken: boolean;
  hasCustomerId: boolean;
  hasRefreshToken: boolean;
  hasOAuthClient: boolean;
  accountEmail: string;
  refreshSource: "platform" | "env" | "none";
};

export type GoogleAdsRuntimeCredentials = {
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
};

function envCustomerId(): string {
  return normalizeAdsCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID ?? "");
}

function envLoginCustomerId(): string {
  return normalizeAdsCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "");
}

export function buildGoogleAdsUiStatus(
  platform: PlatformGoogleAdsPublicStatus | null,
): GoogleAdsPublicStatus {
  const hasLegacyDeveloperToken = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
  const hasOAuthClient = googleOAuthConfigured();
  const envRefresh = Boolean(process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim());
  const platformRefresh = Boolean(platform?.connected);
  const hasRefreshToken = platformRefresh || envRefresh;

  const platformCustomer = normalizeAdsCustomerId(platform?.customerId ?? "");
  const envCustomer = envCustomerId();
  const customerId = platformCustomer.length === 10 ? platformCustomer : envCustomer;
  const hasCustomerId = customerId.length === 10;

  let refreshSource: GoogleAdsPublicStatus["refreshSource"] = "none";
  if (platformRefresh) refreshSource = "platform";
  else if (envRefresh) refreshSource = "env";

  return {
    configured: hasOAuthClient && hasRefreshToken && hasCustomerId,
    hasLegacyDeveloperToken,
    hasCustomerId,
    hasRefreshToken,
    hasOAuthClient,
    accountEmail: platform?.accountEmail ?? "",
    refreshSource,
  };
}

/** @deprecated Prefer buildGoogleAdsUiStatus with platform integration status. */
export function googleAdsPublicStatus(): GoogleAdsPublicStatus {
  return buildGoogleAdsUiStatus(null);
}

export async function loadGoogleAdsRuntimeCredentials(): Promise<GoogleAdsRuntimeCredentials | null> {
  if (!googleOAuthConfigured()) return null;

  let refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ?? "";
  let customerId = envCustomerId();
  let loginCustomerId = envLoginCustomerId();

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .schema("app")
      .from("platform_integrations")
      .select("status, refresh_token, metadata")
      .eq("provider", "google_ads")
      .maybeSingle();

    if (data?.status === "connected" && String(data.refresh_token ?? "").trim()) {
      refreshToken = String(data.refresh_token).trim();
      const meta = (data.metadata ?? {}) as Record<string, unknown>;
      const fromDb = normalizeAdsCustomerId(String(meta.customerId ?? ""));
      const loginFromDb = normalizeAdsCustomerId(String(meta.loginCustomerId ?? ""));
      if (fromDb.length === 10) customerId = fromDb;
      if (loginFromDb.length === 10) loginCustomerId = loginFromDb;
    }
  } catch {
    /* env-only fallback when service role unavailable locally */
  }

  if (!refreshToken || customerId.length !== 10) return null;
  return {
    refreshToken,
    customerId,
    loginCustomerId: loginCustomerId.length === 10 ? loginCustomerId : undefined,
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

function humanizeGoogleAdsErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid_grant")) {
    return (
      "Google OAuth refresh token is ongeldig (invalid_grant). Ga naar Instellingen → Platform · Google Ads " +
      "en koppel opnieuw (zelfde GOOGLE_CLIENT_ID/SECRET als in Vercel)."
    );
  }
  if (
    lower.includes("explorer access") ||
    lower.includes("keywordplanideaservice") ||
    lower.includes("not allowed for use with explorer")
  ) {
    return (
      "Keyword Planner vereist Google Ads API Basic (of Standard). Explorer-toegang mag KeywordPlanIdeaService niet gebruiken. " +
      "In Google Cloud → Google Ads API → Overview: voltooi brand verification en vraag Basic access aan. " +
      "Alternatief voor testen: gebruik een Google Ads testaccount als customer ID met Test-toegang."
    );
  }
  return raw;
}

/** google-ads-api / gRPC failures are often plain objects, not Error instances. */
export function formatGoogleAdsError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.trim();
    return humanizeGoogleAdsErrorMessage(msg || "Google Ads API-fout");
  }
  if (typeof error === "string" && error.trim()) return humanizeGoogleAdsErrorMessage(error.trim());
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
    if (json && json !== "{}") return humanizeGoogleAdsErrorMessage(json);
  } catch {
    /* ignore */
  }
  return "Keywordonderzoek mislukt (onbekende Google Ads-fout)";
}

function adsClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    developer_token: googleAdsDeveloperTokenForClient(),
  });
}

function adsCustomer(creds: GoogleAdsRuntimeCredentials) {
  const client = adsClient();
  return client.Customer({
    customer_id: creds.customerId,
    refresh_token: creds.refreshToken,
    login_customer_id: creds.loginCustomerId,
  });
}

export async function resolveGeoTargetConstants(
  countryCode: string,
  city: string | null | undefined,
  creds: GoogleAdsRuntimeCredentials,
): Promise<string[]> {
  const country = countryCode.toUpperCase();
  const countryGeo = COUNTRY_GEO[country];
  if (!countryGeo) throw new Error(`Land ${countryCode} wordt nog niet ondersteund (BE/NL).`);

  const targets = [countryGeo];
  const cityName = city?.trim();
  if (!cityName) return targets;

  const customer = adsCustomer(creds);
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

  const creds = await loadGoogleAdsRuntimeCredentials();
  if (!creds) {
    throw new Error(
      "Google Ads is niet geconfigureerd. Koppel in Instellingen → Platform · Google Ads en vul een customer ID in.",
    );
  }

  const customer = adsCustomer(creds);
  const geoTargetConstants = await resolveGeoTargetConstants(input.countryCode, input.city, creds);
  const languageConstant =
    LANGUAGE_CONSTANT[input.language.slice(0, 2).toLowerCase()] ?? LANGUAGE_CONSTANT.nl;

  const siteUrl = input.siteUrl?.trim();
  const request = {
    customer_id: creds.customerId,
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
