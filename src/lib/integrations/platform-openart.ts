export const PLATFORM_OPENART_PROVIDER = "openart";

export const PLATFORM_OPENART_MIGRATION =
  "Pas migratie 20260330136417_openart_video_billing.sql toe in Supabase (na 20260330136416).";

export const OPENART_OAUTH_COOKIE = "vice_openart_oauth_state";
export const OPENART_REDIRECT_COOKIE = "vice_openart_oauth_redirect";
export const OPENART_PKCE_COOKIE = "vice_openart_pkce_verifier";
export const OPENART_CLIENT_COOKIE = "vice_openart_oauth_client_id";

export type PlatformOpenArtPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  projectId: string;
  subscriptionActive: boolean;
  openArtCredits: number | null;
  lastError: string;
  updatedAt?: string;
};

export function emptyPlatformOpenArtStatus(): PlatformOpenArtPublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    projectId: "",
    subscriptionActive: false,
    openArtCredits: null,
    lastError: "",
  };
}

export function parsePlatformOpenArtPublic(raw: unknown): PlatformOpenArtPublicStatus {
  if (!raw || typeof raw !== "object") return emptyPlatformOpenArtStatus();
  const row = raw as Record<string, unknown>;
  const creditsRaw = row.openArtCredits;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    projectId: String(row.projectId ?? ""),
    subscriptionActive: Boolean(row.subscriptionActive),
    openArtCredits:
      creditsRaw != null && creditsRaw !== "" && Number.isFinite(Number(creditsRaw))
        ? Number(creditsRaw)
        : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}
