import { assertPublicWebsiteUrl } from "@/lib/brand/website-guard";

const MIN_BYTES = 20_000;

export async function capturePublicScreenshot(input: string): Promise<{ ok: true; bytes: Uint8Array; mime: "image/jpeg" } | { ok: false; error: string }> {
  let target: URL;
  try {
    target = assertPublicWebsiteUrl(input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Dit adres kan niet worden vastgelegd." };
  }
  const local = await captureWithPlaywright(target.toString());
  if (local) return { ok: true, bytes: local, mime: "image/jpeg" };
  const remote = await captureWithPublicShot(target.toString());
  if (remote) return { ok: true, bytes: remote, mime: "image/jpeg" };
  return { ok: false, error: "De homepage-snapshot lukte niet. De tekst van de site is wel gelezen." };
}

async function captureWithPlaywright(url: string): Promise<Uint8Array | null> {
  try {
    const load = new Function("name", "return import(name)") as (name: string) => Promise<{ chromium: { launch: (options: { headless: boolean }) => Promise<PlaywrightBrowser> } }>;
    const { chromium } = await load("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const shot = await page.screenshot({ type: "jpeg", quality: 70 });
      return shot.byteLength >= MIN_BYTES ? new Uint8Array(shot) : null;
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

type PlaywrightBrowser = {
  newPage: (options: { viewport: { width: number; height: number } }) => Promise<{
    goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
    screenshot: (options: { type: "jpeg"; quality: number }) => Promise<Uint8Array>;
  }>;
  close: () => Promise<void>;
};

async function captureWithPublicShot(url: string): Promise<Uint8Array | null> {
  const endpoint = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1280`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(endpoint, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (response.ok && type.includes("jpeg") && bytes.byteLength >= MIN_BYTES) return bytes;
    } catch {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}
