import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export default async function StrategyWebsitePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
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

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-vice-text">Website</h1>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
          Website-analyse en -tools voor deze klant. Meer functies volgen hier.
        </p>
      </header>

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
      </section>
    </div>
  );
}
