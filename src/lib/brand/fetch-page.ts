import { lookup } from "node:dns/promises";
import { assertPublicWebsiteUrl, isBlockedWebsiteHost, isPrivateIp } from "@/lib/brand/website-guard";

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

export type PageFetch = { ok: true; finalUrl: string; excerpt: string } | { ok: false; error: string };

async function assertResolvedPublic(hostname: string): Promise<void> {
  if (isBlockedWebsiteHost(hostname) || isPrivateIp(hostname)) {
    throw new Error("Interne of privé-adressen worden niet opgehaald.");
  }
  if (isPrivateIp(hostname)) return;
  const numeric = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
  if (numeric) return;
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("Het adres kon niet worden gevonden.");
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("Deze link wijst naar een privénetwerk en wordt niet opgehaald.");
  }
}

export async function fetchPublicPageText(input: string): Promise<PageFetch> {
  try {
    let current = assertPublicWebsiteUrl(input);
    await assertResolvedPublic(current.hostname);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "VICE-BrandAudit/1.0",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, error: "De pagina stuurde door zonder bestemming." };
        if (hop === MAX_REDIRECTS) return { ok: false, error: "Te veel doorverwijzingen." };
        current = assertPublicWebsiteUrl(new URL(location, current).toString());
        await assertResolvedPublic(current.hostname);
        continue;
      }
      if (!response.ok) return { ok: false, error: `De pagina antwoordde met status ${response.status}.` };
      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      if (type && !type.includes("text/html") && !type.includes("text/plain") && !type.includes("application/xhtml")) {
        return { ok: false, error: "Dit adres is geen leesbare HTML-pagina. Een login, pdf of afbeelding wordt niet als site-analyse behandeld." };
      }
      const excerpt = await readExcerpt(response);
      if (excerpt.length < 40) return { ok: false, error: "Er kwam te weinig leesbare tekst terug. Een cookiebanner of lege pagina is geen analyse." };
      return { ok: true, finalUrl: current.toString(), excerpt };
    }
    return { ok: false, error: "De pagina kon niet worden gelezen." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "De pagina kon niet worden opgehaald." };
  }
}

async function readExcerpt(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < MAX_BYTES) {
    const step = await reader.read();
    if (step.done) break;
    received += step.value.byteLength;
    chunks.push(step.value);
  }
  await reader.cancel().catch(() => undefined);
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}
