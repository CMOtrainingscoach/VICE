import { createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";
const BLOGGER_API = "https://www.googleapis.com/blogger/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/blogger",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export type BloggerPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  blogId: string | null;
  blogName: string | null;
  blogUrl: string | null;
  lastError: string;
  updatedAt?: string;
};

export type BloggerBlog = {
  id: string;
  name: string;
  url: string;
};

export type BloggerSecrets = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
  accountEmail: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Basis-URL voor OAuth: bij voorkeur het echte request-origin (Vercel/lokaal). */
export function resolveAppBaseUrl(requestOrigin?: string | null) {
  const fromRequest = (requestOrigin ?? "").replace(/\/$/, "");
  if (fromRequest.startsWith("http://") || fromRequest.startsWith("https://")) {
    return fromRequest;
  }
  return appUrl();
}

export function bloggerConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function bloggerRedirectUri(baseUrl?: string) {
  return `${(baseUrl ?? appUrl()).replace(/\/$/, "")}/api/integrations/blogger/callback`;
}

export function createOAuthState(tenantId: string) {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${tenantId}.${nonce}.${Date.now()}`;
  const sig = createHash("sha256")
    .update(`${payload}.${process.env.GOOGLE_CLIENT_SECRET ?? "vice"}`)
    .digest("hex")
    .slice(0, 24);
  return `${payload}.${sig}`;
}

export function parseOAuthState(state: string): { tenantId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [tenantId, nonce, ts, sig] = parts;
  if (!tenantId || !nonce || !ts || !sig) return null;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) return null;
  const payload = `${tenantId}.${nonce}.${ts}`;
  const expected = createHash("sha256")
    .update(`${payload}.${process.env.GOOGLE_CLIENT_SECRET ?? "vice"}`)
    .digest("hex")
    .slice(0, 24);
  if (expected !== sig) return null;
  return { tenantId };
}

export function buildBloggerAuthUrl(state: string, redirectUri?: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri ?? bloggerRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeBloggerCode(code: string, redirectUri?: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri ?? bloggerRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google tokenuitwisseling mislukt");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function refreshBloggerAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google token vernieuwen mislukt");
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function fetchGoogleAccountEmail(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { email?: string };
  return String(json.email ?? "");
}

export async function listBloggerBlogs(accessToken: string): Promise<BloggerBlog[]> {
  const res = await fetch(`${BLOGGER_API}/users/self/blogs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    items?: Array<{ id?: string; name?: string; url?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || "Blogger-blogs ophalen mislukt");
  }
  return (json.items ?? [])
    .filter((item) => item.id)
    .map((item) => ({
      id: String(item.id),
      name: String(item.name ?? "Blog"),
      url: String(item.url ?? ""),
    }));
}

export async function publishBloggerPost(input: {
  accessToken: string;
  blogId: string;
  title: string;
  content: string;
  isDraft?: boolean;
}) {
  const res = await fetch(`${BLOGGER_API}/blogs/${encodeURIComponent(input.blogId)}/posts/?isDraft=${input.isDraft ? "true" : "false"}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: "blogger#post",
      title: input.title,
      content: input.content,
    }),
  });
  const json = (await res.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || "Publiceren naar Blogger mislukt");
  }
  return {
    postId: String(json.id),
    url: String(json.url ?? ""),
  };
}

/** Zet VICE-editor-HTML om naar Blogger-vriendelijke content. */
export function toBloggerHtml(bodyHtml: string): string {
  let html = bodyHtml;
  html = html.replace(
    /<div[^>]*data-blog-more[^>]*>[\s\S]*?<\/div>/gi,
    "<!--more-->",
  );
  html = html.replace(
    /<figure[^>]*data-visual-id=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>[\s\S]*?<\/figure>/gi,
    (_m, _id, src, alt) => `<p><img src="${src}" alt="${alt}" /></p>`,
  );
  html = html.replace(
    /<figure[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>[\s\S]*?<\/figure>/gi,
    (_m, src, alt) => `<p><img src="${src}" alt="${alt ?? ""}" /></p>`,
  );
  html = html.replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "");
  html = html.replace(/\scontenteditable=["'][^"']*["']/gi, "");
  html = html.replace(/\sdata-[a-z-]+=["'][^"']*["']/gi, "");
  html = html.replace(/\sclass=["'][^"']*["']/gi, "");
  return html.trim();
}

export function emptyBloggerStatus(): BloggerPublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    blogId: null,
    blogName: null,
    blogUrl: null,
    lastError: "",
  };
}

export function parseBloggerPublic(raw: unknown): BloggerPublicStatus {
  if (!raw || typeof raw !== "object") return emptyBloggerStatus();
  const row = raw as Record<string, unknown>;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    blogId: row.blogId ? String(row.blogId) : null,
    blogName: row.blogName ? String(row.blogName) : null,
    blogUrl: row.blogUrl ? String(row.blogUrl) : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function parseBloggerSecrets(raw: unknown): BloggerSecrets | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.accessToken && !row.refreshToken) return null;
  return {
    accessToken: String(row.accessToken ?? ""),
    refreshToken: String(row.refreshToken ?? ""),
    tokenExpiresAt: row.tokenExpiresAt ? String(row.tokenExpiresAt) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    accountEmail: String(row.accountEmail ?? ""),
  };
}
