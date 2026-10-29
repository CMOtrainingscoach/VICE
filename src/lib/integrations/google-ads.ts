import { googleOAuthConfigured } from "@/lib/integrations/google-oauth";
import {
  normalizeAdsCustomerId,
  type PlatformGoogleAdsPublicStatus,
} from "@/lib/integrations/platform-google-ads";
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
  return "Google Ads-fout";
}
