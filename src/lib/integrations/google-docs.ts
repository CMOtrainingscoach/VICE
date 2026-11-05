import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleOAuthConfigured,
  integrationRedirectUri,
  parseGoogleIntegrationSecrets,
  refreshGoogleAccessToken,
  type GoogleIntegrationSecrets,
} from "@/lib/integrations/google-oauth";

/** Full Drive + Docs for browse/CRUD in Documenten (users must reconnect after scope change). */
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONNECT_PATH = "/api/integrations/google-docs/connect";
const CALLBACK_PATH = "/api/integrations/google-docs/callback";

export type GoogleDocsPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  projectFolderId: string | null;
  projectFolderName: string | null;
  projectFolderUrl: string | null;
  lastError: string;
  updatedAt?: string;
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
    projectFolderId: null,
    projectFolderName: null,
    projectFolderUrl: null,
    lastError: "",
  };
}

export function parseGoogleDocsPublic(raw: unknown): GoogleDocsPublicStatus {
  if (!raw || typeof raw !== "object") return emptyGoogleDocsStatus();
  const row = raw as Record<string, unknown>;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    projectFolderId: row.projectFolderId ? String(row.projectFolderId) : null,
    projectFolderName: row.projectFolderName ? String(row.projectFolderName) : null,
    projectFolderUrl: row.projectFolderUrl ? String(row.projectFolderUrl) : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function parseGoogleDocsSecrets(raw: unknown): GoogleIntegrationSecrets | null {
  return parseGoogleIntegrationSecrets(raw);
}

export const GOOGLE_DOCS_OAUTH_COOKIE = "vice_gdocs_oauth";
export const GOOGLE_DOCS_REDIRECT_COOKIE = "vice_gdocs_redirect";

export { CONNECT_PATH, CALLBACK_PATH };
