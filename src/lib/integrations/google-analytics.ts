import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleOAuthConfigured,
  integrationRedirectUri,
  parseGoogleIntegrationSecrets,
  refreshGoogleAccessToken,
  type GoogleIntegrationSecrets,
} from "@/lib/integrations/google-oauth";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONNECT_PATH = "/api/integrations/google-analytics/connect";
const CALLBACK_PATH = "/api/integrations/google-analytics/callback";

export type GoogleAnalyticsPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  propertyId: string | null;
  propertyName: string | null;
  accountId: string | null;
  lastError: string;
  updatedAt?: string;
};

export type GoogleAnalyticsProperty = {
  propertyId: string;
  propertyName: string;
  accountId: string;
  accountName: string;
};

export function googleAnalyticsConfigured() {
  return googleOAuthConfigured();
}

export function googleAnalyticsRedirectUri(baseUrl?: string) {
  return integrationRedirectUri(CALLBACK_PATH, baseUrl);
}

export function buildGoogleAnalyticsAuthUrl(state: string, redirectUri?: string) {
  return buildGoogleAuthUrl(SCOPES, state, redirectUri ?? googleAnalyticsRedirectUri());
}

export async function exchangeGoogleAnalyticsCode(code: string, redirectUri?: string) {
  return exchangeGoogleCode(code, redirectUri ?? googleAnalyticsRedirectUri());
}

export { refreshGoogleAccessToken as refreshGoogleAnalyticsAccessToken };

export async function listGoogleAnalyticsProperties(
  accessToken: string,
): Promise<GoogleAnalyticsProperty[]> {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    accountSummaries?: {
      account?: string;
      displayName?: string;
      propertySummaries?: {
        property?: string;
        displayName?: string;
      }[];
    }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || "Analytics-properties ophalen mislukt");
  }

  const out: GoogleAnalyticsProperty[] = [];
  for (const account of json.accountSummaries ?? []) {
    const accountId = String(account.account ?? "").replace(/^accounts\//, "");
    const accountName = String(account.displayName ?? accountId);
    for (const prop of account.propertySummaries ?? []) {
      const propertyId = String(prop.property ?? "").replace(/^properties\//, "");
      if (!propertyId) continue;
      out.push({
        propertyId,
        propertyName: String(prop.displayName ?? propertyId),
        accountId,
        accountName,
      });
    }
  }
  return out.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
}

export function emptyGoogleAnalyticsStatus(): GoogleAnalyticsPublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    propertyId: null,
    propertyName: null,
    accountId: null,
    lastError: "",
  };
}

export function parseGoogleAnalyticsPublic(raw: unknown): GoogleAnalyticsPublicStatus {
  if (!raw || typeof raw !== "object") return emptyGoogleAnalyticsStatus();
  const row = raw as Record<string, unknown>;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    propertyId: row.propertyId ? String(row.propertyId) : null,
    propertyName: row.propertyName ? String(row.propertyName) : null,
    accountId: row.accountId ? String(row.accountId) : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function parseGoogleAnalyticsSecrets(raw: unknown): GoogleIntegrationSecrets | null {
  return parseGoogleIntegrationSecrets(raw);
}

export const GOOGLE_ANALYTICS_OAUTH_COOKIE = "vice_ga_oauth";
export const GOOGLE_ANALYTICS_REDIRECT_COOKIE = "vice_ga_redirect";
export const GOOGLE_ANALYTICS_CONNECT_PATH = CONNECT_PATH;

export type GaReportRequest = {
  dateRanges: { startDate: string; endDate: string; name?: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  limit?: number;
  orderBys?: { metric?: { metricName: string }; desc?: boolean }[];
};

export type GaReportRow = {
  dimensionValues: string[];
  metricValues: number[];
};

export async function runGaReport(
  accessToken: string,
  propertyId: string,
  body: GaReportRequest,
): Promise<GaReportRow[]> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = (await res.json()) as {
    rows?: {
      dimensionValues?: { value?: string }[];
      metricValues?: { value?: string }[];
    }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || "GA4-rapport ophalen mislukt");
  }
  return (json.rows ?? []).map((row) => ({
    dimensionValues: (row.dimensionValues ?? []).map((d) => String(d.value ?? "")),
    metricValues: (row.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
}
