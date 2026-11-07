import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  WebsiteSectionTabs,
  type WebsiteSectionTab,
} from "@/components/website/website-section-tabs";
import { WebsiteCrawlWorkspace } from "@/components/website/website-crawl-workspace";
import { emptyWebsiteCrawlSettings } from "@/lib/website/crawl-parse";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadWebsiteCrawlAction } from "@/modules/website/crawl-actions";

export const maxDuration = 300;

function parseTab(raw: string | undefined): WebsiteSectionTab {
  return raw === "crawl" ? "crawl" : "overzicht";
}

export default async function StrategyWebsitePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenantId } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab = parseTab(tabRaw);

  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("name, website")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantData) notFound();

  const website = tenantData.website?.trim() || "";
  const strategieHref = `/klanten/${tenantId}/strategie`;

  const crawlLoad = tab === "crawl" ? await loadWebsiteCrawlAction(tenantId) : null;
  const crawlSettings =
    crawlLoad?.ok && crawlLoad.data ? crawlLoad.data.settings : emptyWebsiteCrawlSettings();
  const crawlPages = crawlLoad?.ok && crawlLoad.data ? crawlLoad.data.pages : [];
  const crawlError = crawlLoad && !crawlLoad.ok ? crawlLoad.error : "";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <nav className="mb-4 text-sm text-vice-text-muted">
        <Link href="/klanten" className="hover:text-vice-text">
          Klanten
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/klanten/${tenantId}`} className="hover:text-vice-text">
          {tenantData.name}
        </Link>
        <span className="mx-2">/</span>
        <Link href={strategieHref} className="hover:text-vice-text">
          Strategische audit
        </Link>
        <span className="mx-2">/</span>
        <span className="text-vice-text">Website</span>
      </nav>

      <header className="mb-2">
        <h1 className="text-3xl font-semibold text-vice-text">Website</h1>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
          Sitemap, crawl en pagina-geheugen voor deze klant.
        </p>
      </header>

      <WebsiteSectionTabs tenantId={tenantId} tab={tab} />

      {tab === "overzicht" ? (
        <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
          <h2 className="text-lg font-medium text-vice-text">Klantwebsite</h2>
          {website ? (
            <p className="mt-3 text-sm">
              <a
                href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-vice-gold hover:underline"
              >
                {website}
              </a>
              <span className="text-vice-text-muted"> — uit klantgegevens.</span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-vice-text-muted">
              Nog geen URL ingesteld. Vul de website in bij{" "}
              <Link href={`/klanten/${tenantId}`} className="text-vice-gold hover:underline">
                klantoverzicht
              </Link>
              .
            </p>
          )}
          <p className="mt-4 text-sm text-vice-text-muted">
            Start een crawl via tab{" "}
            <Link href={`/klanten/${tenantId}/strategie/website?tab=crawl`} className="text-vice-gold hover:underline">
              Website crawl
            </Link>
            .
          </p>
        </section>
      ) : (
        <>
          {crawlError ? (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {crawlError}
            </p>
          ) : null}
          <WebsiteCrawlWorkspace
            tenantId={tenantId}
            tenantWebsite={website}
            initialSettings={crawlSettings}
            initialPages={crawlPages}
          />
        </>
      )}
    </div>
  );
}
