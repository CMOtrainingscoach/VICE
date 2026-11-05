import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserAppContext } from "@/lib/auth/context";
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
          Centrale map voor klantbestanden. Meer bronnen (uploads, PDF&apos;s, gekoppelde assets) komen
          hier samen.
        </p>
      </header>

      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">Nu beschikbaar</h2>
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
