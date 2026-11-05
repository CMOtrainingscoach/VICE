import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAppContext } from "@/lib/auth/context";
import { emptyGoogleDocsStatus, parseGoogleDocsPublic } from "@/lib/integrations/google-docs";
import { createClient } from "@/lib/supabase/server";

export default async function TenantDocumentsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) notFound();

  const gdocsResult = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
  });
  const googleDocs = !gdocsResult.error
    ? parseGoogleDocsPublic(gdocsResult.data)
    : emptyGoogleDocsStatus();

  const settingsHref = `/klanten/${tenantId}?tab=instellingen`;

  return (
    <div className="p-8">
      <nav className="mb-4 text-sm text-vice-text-muted">
        <Link href="/klanten" className="hover:text-vice-text">
          Klanten
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/klanten/${tenantId}`} className="hover:text-vice-text">
          {data.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-vice-text">Documenten</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-vice-text">Documenten</h1>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
          Centrale documenten voor deze klant. Koppel Google Docs / Drive in{" "}
          <Link href={settingsHref} className="text-vice-gold hover:underline">
            Instellingen
          </Link>
          .
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">Google Docs / Drive</h2>
        {!googleDocs.connected ? (
          <p className="mt-3 text-sm text-vice-text-muted">
            Nog niet gekoppeld.{" "}
            <Link href={settingsHref} className="font-medium text-vice-gold hover:underline">
              Koppel in Instellingen
            </Link>
            .
          </p>
        ) : !googleDocs.resourceId ? (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            Google-account ({googleDocs.accountEmail || "onbekend"}) is gekoppeld — kies nog een map of
            document in{" "}
            <Link href={settingsHref} className="font-medium text-vice-gold hover:underline">
              Instellingen
            </Link>
            .
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-vice-text">
              {googleDocs.resourceType === "folder" ? "Documentenmap" : "Document"}:{" "}
              <strong>{googleDocs.resourceName}</strong>
            </p>
            {googleDocs.resourceUrl ? (
              <p>
                <a
                  href={googleDocs.resourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-vice-gold hover:underline"
                >
                  Open in Google Drive
                </a>
              </p>
            ) : null}
            {googleDocs.lastError ? (
              <p className="text-red-700 dark:text-red-300">{googleDocs.lastError}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">Overige bronnen in VICE</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>
            <Link
              href={`/klanten/${tenantId}/strategie?tab=document`}
              className="font-medium text-vice-gold hover:underline"
            >
              Strategisch auditdocument
            </Link>
            <span className="text-vice-text-muted"> — markdown context voor strategie en ICP.</span>
          </li>
          <li>
            <Link
              href={`/klanten/${tenantId}/meetings`}
              className="font-medium text-vice-gold hover:underline"
            >
              Meetingtranscripten
            </Link>
            <span className="text-vice-text-muted"> — opnames en goedgekeurde teksten.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
