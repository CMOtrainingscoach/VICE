const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.google"]);

export function isPrivateIp(address: string): boolean {
  const raw = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  if (mapped === "::1" || mapped === "0.0.0.0" || mapped === "::") return true;
  if (mapped.startsWith("fe80:") || mapped.startsWith("fc") || mapped.startsWith("fd")) return true;
  const parts = mapped.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isBlockedWebsiteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true;
  if (isPrivateIp(host)) return true;
  return false;
}

export function assertPublicWebsiteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Gebruik een volledige https-link.");
  }
  if (url.protocol !== "https:") throw new Error("Alleen https-pagina's worden opgehaald.");
  if (url.username || url.password) throw new Error("Een link met gebruikersnaam of wachtwoord wordt niet opgehaald.");
  if (isBlockedWebsiteHost(url.hostname)) throw new Error("Interne of privé-adressen worden niet opgehaald.");
  return url;
}
