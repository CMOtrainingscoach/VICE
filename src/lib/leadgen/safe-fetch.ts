import dns from "node:dns/promises";
import net from "node:net";
import { leadgenFetchTimeoutMs, leadgenMaxFetchBytes } from "@/lib/leadgen/constants";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Host niet toegestaan");
  }
  const records = await dns.lookup(host, { all: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("Privé-adres geblokkeerd");
    }
  }
}

export type SafeFetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  truncated: boolean;
};

export async function safeFetchUrl(inputUrl: string): Promise<SafeFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error("Ongeldige URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Alleen http(s) toegestaan");
  }
  await assertPublicHost(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), leadgenFetchTimeoutMs());

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "VICE-Leadgen/1.0 (+https://vice.app; prospect research)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });

    const finalUrl = response.url;
    const finalHost = new URL(finalUrl).hostname;
    await assertPublicHost(finalHost);

    const contentType = response.headers.get("content-type") ?? "";
    const buffer = await response.arrayBuffer();
    const max = leadgenMaxFetchBytes();
    const truncated = buffer.byteLength > max;
    const slice = buffer.slice(0, max);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);

    return {
      url: parsed.toString(),
      finalUrl,
      status: response.status,
      contentType,
      text,
      truncated,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extractEmailsFromHtml(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))].filter(
    (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.includes("example"),
  ).slice(0, 5);
}

export function extractPhonesFromHtml(html: string): string[] {
  const matches = html.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  return [...new Set(matches.map((m) => m.trim()))].slice(0, 3);
}

export function findBrokenInternalLinks(html: string, baseUrl: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]).slice(0, 40);
  const broken: string[] = [];
  const origin = new URL(baseUrl).origin;
  for (const href of hrefs) {
    try {
      const url = new URL(href, baseUrl);
      if (url.origin !== origin) continue;
      if (url.pathname.includes("mailto:") || url.pathname.includes("tel:")) continue;
      broken.push(url.pathname);
      if (broken.length >= 5) break;
    } catch {
      broken.push(href.slice(0, 80));
    }
  }
  return broken;
}

export function mobileUsabilityHints(html: string): string[] {
  const hints: string[] = [];
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    hints.push("Geen viewport-meta tag");
  }
  if (/width:\s*(\d{4,})px/i.test(html) || /min-width:\s*(\d{4,})px/i.test(html)) {
    hints.push("Fixed-width layout gedetecteerd");
  }
  return hints;
}
