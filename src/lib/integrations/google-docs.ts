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
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONNECT_PATH = "/api/integrations/google-docs/connect";
const CALLBACK_PATH = "/api/integrations/google-docs/callback";

export type GoogleDocsResourceType = "folder" | "document";

export type GoogleDocsPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  resourceType: GoogleDocsResourceType | null;
  resourceId: string | null;
  resourceName: string | null;
  resourceUrl: string | null;
  lastError: string;
  updatedAt?: string;
};

export type GoogleDocsDriveItem = {
  id: string;
  name: string;
  resourceType: GoogleDocsResourceType;
  webViewLink: string | null;
};

export function googleDocsConfigured() {
  return googleOAuthConfigured();
}

export function googleDocsRedirectUri(baseUrl?: string) {
  return integrationRedirectUri(CALLBACK_PATH, baseUrl);
}

export function buildGoogleDocsAuthUrl(state: string, redirectUri?: string) {
  return buildGoogleAuthUrl(SCOPES, state, redirectUri ?? googleDocsRedirectUri());
}

export async function exchangeGoogleDocsCode(code: string, redirectUri?: string) {
  return exchangeGoogleCode(code, redirectUri ?? googleDocsRedirectUri());
}

export { refreshGoogleAccessToken as refreshGoogleDocsAccessToken };

export function emptyGoogleDocsStatus(): GoogleDocsPublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    resourceType: null,
    resourceId: null,
    resourceName: null,
    resourceUrl: null,
    lastError: "",
  };
}

export function parseGoogleDocsPublic(raw: unknown): GoogleDocsPublicStatus {
  if (!raw || typeof raw !== "object") return emptyGoogleDocsStatus();
  const row = raw as Record<string, unknown>;
  const typeRaw = row.resourceType ? String(row.resourceType) : "";
  const resourceType =
    typeRaw === "folder" || typeRaw === "document" ? (typeRaw as GoogleDocsResourceType) : null;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    resourceType,
    resourceId: row.resourceId ? String(row.resourceId) : null,
    resourceName: row.resourceName ? String(row.resourceName) : null,
    resourceUrl: row.resourceUrl ? String(row.resourceUrl) : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function parseGoogleDocsSecrets(raw: unknown): GoogleIntegrationSecrets | null {
  return parseGoogleIntegrationSecrets(raw);
}

export const GOOGLE_DOCS_OAUTH_COOKIE = "vice_gdocs_oauth";
export const GOOGLE_DOCS_REDIRECT_COOKIE = "vice_gdocs_redirect";

export async function listGoogleDocsDriveItems(accessToken: string): Promise<GoogleDocsDriveItem[]> {
  const q = encodeURIComponent(
    "(mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.document') and trashed=false",
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=100&orderBy=folder,name&fields=files(id,name,mimeType,webViewLink)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await res.json()) as {
    files?: { id?: string; name?: string; mimeType?: string; webViewLink?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || "Google Drive-items ophalen mislukt");
  }
  const files = json.files ?? [];
  return files
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: String(f.id),
      name: String(f.name),
      resourceType:
        f.mimeType === "application/vnd.google-apps.folder"
          ? ("folder" as const)
          : ("document" as const),
      webViewLink: f.webViewLink ? String(f.webViewLink) : null,
    }))
    .sort((a, b) => {
      if (a.resourceType !== b.resourceType) {
        return a.resourceType === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "nl");
    });
}

export { CONNECT_PATH, CALLBACK_PATH };
