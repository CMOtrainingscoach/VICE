import type { PageRole } from "@/lib/brand/constants";

const ROLE_HINTS: { role: Exclude<PageRole, "home" | "other">; pattern: RegExp }[] = [
  { role: "about", pattern: /about|over-ons|overons|wie-zijn|team|ons-verhaal/ },
  { role: "offer", pattern: /dienst|service|aanbod|product|oploss|wat-we/ },
  { role: "proof", pattern: /case|referent|testimonial|klanten|resultaat/ },
  { role: "contact", pattern: /contact|demo|afspraak|kennismak/ },
];

function hostOf(value: string): string {
  return new URL(value).hostname.replace(/^www\./, "");
}

export function samePage(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const path = (url: URL) => url.pathname.replace(/\/$/, "") || "/";
    return hostOf(a.toString()) === hostOf(b.toString()) && path(a) === path(b);
  } catch {
    return false;
  }
}

function clean(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

export function selectScanTargets(homeUrl: string, links: string[], limit = 6): { url: string; role: PageRole }[] {
  const home = clean(homeUrl);
  const chosen: { url: string; role: PageRole }[] = [{ url: home, role: "home" }];
  const seen = new Set([home]);
  const sameHost = links.flatMap((link) => {
    try {
      const url = new URL(link);
      if (hostOf(url.toString()) !== hostOf(home)) return [];
      if (/\.(pdf|jpg|jpeg|png|webp|svg|css|js|zip|xml|ico)$/i.test(url.pathname)) return [];
      return [clean(url.toString())];
    } catch {
      return [];
    }
  });
  for (const hint of ROLE_HINTS) {
    const match = sameHost.find((link) => !seen.has(link) && hint.pattern.test(new URL(link).pathname.toLowerCase()));
    if (!match) continue;
    seen.add(match);
    chosen.push({ url: match, role: hint.role });
    if (chosen.length >= limit) return chosen;
  }
  for (const link of sameHost) {
    if (chosen.length >= limit) break;
    if (seen.has(link)) continue;
    seen.add(link);
    chosen.push({ url: link, role: "other" });
  }
  return chosen;
}

export function findingIsGrounded(observation: string, corpus: string): boolean {
  const text = observation.trim();
  if (text.length < 20) return false;
  const numbers = text.match(/\d+(?:[.,]\d+)?%?/g) ?? [];
  return numbers.every((number) => number.length < 2 || corpus.includes(number));
}
