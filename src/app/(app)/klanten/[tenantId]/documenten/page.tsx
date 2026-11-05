import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GoogleDriveWorkspace } from "@/components/documents/google-drive-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { emptyGoogleDocsStatus, parseGoogleDocsPublic } from "@/lib/integrations/google-docs";
import { createClient } from "@/lib/supabase/server";

export default async function TenantDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenantId } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab = tabRaw === "drive" ? "drive" : "bronnen";

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
  const base = `/klanten/${tenantId}/documenten`;

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

      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-vice-text">Documenten</h1>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
          Bronnen in VICE en gekoppelde Google Drive van deze klant.
        </p>
      </header>

      <div className="mb-6 flex gap-1 border-b border-vice-border">
        <TabLink href={`${base}?tab=bronnen`} active={tab === "bronnen"}>
          Bronnen in VICE
        </TabLink>
        <TabLink href={`${base}?tab=drive`} active={tab === "drive"}>
          Google Drive
        </TabLink>
      </div>

      {tab === "drive" ? (
        <GoogleDriveWorkspace
          tenantId={tenantId}
          settingsHref={settingsHref}
          initialStatus={googleDocs}
        />
      ) : (
        <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
          <h2 className="text-lg font-medium text-vice-text">Interne bronnen</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <Link
                href={`/klanten/${tenantId}/strategie?tab=document`}
                className="font-medium text-vice-gold hover:underline"
              >
                Strategisch auditdocument
              </Link>
              <span className="text-vice-text-muted"> — markdown voor strategie en ICP.</span>
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
          <p className="mt-4 text-sm text-vice-text-muted">
            Google Drive:{" "}
            <Link
              href={
                googleDocs.projectFolderId ? `${base}?tab=drive#vice-project-folder` : `${base}?tab=drive`
              }
              className="text-vice-gold hover:underline"
            >
              {googleDocs.projectFolderName
                ? `Projectmap «${googleDocs.projectFolderName}»`
                : "tab Google Drive"}
            </Link>
            {googleDocs.connected ? "" : " (koppel eerst in Instellingen)"}.
          </p>
        </section>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "border-b-2 border-vice-gold px-4 py-2 text-sm font-medium text-vice-text"
          : "px-4 py-2 text-sm text-vice-text-muted hover:text-vice-text"
      }
    >
      {children}
    </Link>
  );
}
