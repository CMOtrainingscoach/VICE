export type WordPressPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  siteUrl: string | null;
  siteName: string | null;
  lastError: string;
  updatedAt?: string;
};

export type WordPressSecrets = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
};

export function emptyWordPressStatus(): WordPressPublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    siteUrl: null,
    siteName: null,
    lastError: "",
  };
}

export function parseWordPressPublic(raw: unknown): WordPressPublicStatus {
  if (!raw || typeof raw !== "object") return emptyWordPressStatus();
  const row = raw as Record<string, unknown>;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    siteUrl: row.siteUrl ? String(row.siteUrl) : null,
    siteName: row.siteName ? String(row.siteName) : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function parseWordPressSecrets(raw: unknown, metadataSiteUrl?: string | null): WordPressSecrets | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const meta =
    row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const siteUrl = normalizeWordPressSiteUrl(
    String(metadataSiteUrl ?? meta.siteUrl ?? row.siteUrl ?? ""),
  );
  const username = String(row.accountEmail ?? meta.username ?? "").trim();
  const applicationPassword = String(row.accessToken ?? row.access_token ?? "").trim();
  if (!siteUrl || !username || !applicationPassword) return null;
  return { siteUrl, username, applicationPassword };
}

export function normalizeWordPressSiteUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Alleen http(s) WordPress-sites worden ondersteund.");
  }
  parsed.hash = "";
  parsed.search = "";
  let path = parsed.pathname.replace(/\/+$/, "");
  if (path.endsWith("/wp-admin")) path = path.slice(0, -"/wp-admin".length);
  parsed.pathname = path || "";
  return parsed.toString().replace(/\/$/, "");
}

export function wordPressApiRoot(siteUrl: string): string {
  return `${normalizeWordPressSiteUrl(siteUrl)}/wp-json/wp/v2`;
}

function basicAuthHeader(username: string, applicationPassword: string): string {
  const token = Buffer.from(`${username}:${applicationPassword.replace(/\s+/g, "")}`, "utf8").toString(
    "base64",
  );
  return `Basic ${token}`;
}

async function wpFetch(
  siteUrl: string,
  username: string,
  applicationPassword: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${wordPressApiRoot(siteUrl)}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", basicAuthHeader(username, applicationPassword));
  return fetch(url, { ...init, headers });
}

export async function verifyWordPressConnection(secrets: WordPressSecrets): Promise<{ siteName: string }> {
  const res = await wpFetch(secrets.siteUrl, secrets.username, secrets.applicationPassword, "/users/me");
  const json = (await res.json()) as { name?: string; message?: string; code?: string };
  if (!res.ok) {
    throw new Error(
      json.message ||
        (res.status === 401
          ? "WordPress-login mislukt. Controleer gebruikersnaam en application password."
          : `WordPress-verbinding mislukt (${res.status}).`),
    );
  }
  return { siteName: String(json.name ?? secrets.siteUrl) };
}

export async function publishWordPressPost(input: {
  secrets: WordPressSecrets;
  title: string;
  content: string;
  status: "publish" | "draft";
}): Promise<{ postId: string; url: string }> {
  const res = await wpFetch(
    input.secrets.siteUrl,
    input.secrets.username,
    input.secrets.applicationPassword,
    "/posts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        status: input.status,
      }),
    },
  );
  const json = (await res.json()) as { id?: number; link?: string; message?: string; code?: string };
  if (!res.ok || json.id == null) {
    throw new Error(json.message || "Publiceren naar WordPress mislukt");
  }
  return {
    postId: String(json.id),
    url: String(json.link ?? ""),
  };
}

export async function uploadWordPressMedia(input: {
  secrets: WordPressSecrets;
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const fileName = input.fileName.replace(/[^\w.\-]+/g, "_") || `vice-${Date.now()}.png`;
  const res = await wpFetch(
    input.secrets.siteUrl,
    input.secrets.username,
    input.secrets.applicationPassword,
    "/media",
    {
      method: "POST",
      headers: {
        "Content-Type": input.mimeType || "image/png",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
      body: Buffer.from(input.bytes),
    },
  );
  const json = (await res.json()) as { source_url?: string; message?: string };
  if (!res.ok || !json.source_url) {
    throw new Error(json.message || "Afbeelding uploaden naar WordPress mislukt");
  }
  return String(json.source_url);
}
