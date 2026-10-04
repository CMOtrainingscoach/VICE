import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TenantForm } from "@/components/clients/tenant-form";
import { TenantAdminPanel } from "@/components/clients/tenant-admin-panel";
import { BcgPublishedView } from "@/components/bcg/bcg-published";
import { PersonaPublishedView } from "@/components/persona/persona-published";
import { StpPublishedView } from "@/components/stp/stp-published";
import { EmptyState } from "@/components/ui/empty-state";
import type { BcgPublished } from "@/lib/bcg/types";
import type { PersonaPublished } from "@/lib/persona/types";
import type { StpPublished } from "@/lib/stp/types";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadPersonaPublishedAction } from "@/modules/persona/actions";
import { TENANT_STATUS_LABELS, type TenantRow } from "@/lib/types/tenant";

export default async function TenantDetailPage({
  params,
}: PageProps<"/klanten/[tenantId]">) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const tenant = data as TenantRow;
  const isAdmin = ctx.isPlatformAdmin;
  let publishedBcg: BcgPublished | null = null;
  let publishedStp: StpPublished | null = null;
  let publishedPersonas: PersonaPublished | null = null;
  if (!isAdmin) {
    const published = await supabase.schema("app").rpc("get_bcg_published", { p_tenant_id: tenantId });
    if (!published.error && published.data && typeof published.data === "object" && (published.data as BcgPublished).published) {
      publishedBcg = published.data as BcgPublished;
    }
    const stp = await supabase.schema("app").rpc("get_stp_published", { p_tenant_id: tenantId });
    if (!stp.error && stp.data && typeof stp.data === "object" && (stp.data as StpPublished).published) {
      publishedStp = stp.data as StpPublished;
    }
    const personas = await loadPersonaPublishedAction(tenantId);
    if (personas?.published) publishedPersonas = personas;
  }

  return (
    <div className="p-8">
      <nav className="mb-4 text-sm text-vice-text-muted">
        {isAdmin && (
          <>
            <Link href="/klanten" className="hover:text-vice-text">
              Klanten
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-vice-text">{tenant.name}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-vice-text">{tenant.name}</h1>
          <p className="mt-2 text-sm text-vice-text-muted">
            {isAdmin
              ? "Je strategie krijgt vorm — intake en audit volgen in fase 2–3."
              : "Welkom in je klantomgeving."}
          </p>
          <p className="mt-1 text-xs text-vice-text-muted">
            Status: {TENANT_STATUS_LABELS[tenant.status]}
          </p>
        </div>
        {isAdmin && (
          <Link
            href={`/klanten/${tenantId}/meetings/nieuw`}
            className="rounded-md bg-vice-gold px-4 py-2 text-sm font-medium text-white hover:bg-vice-gold-hover"
          >
            Meeting opnemen
          </Link>
        )}
      </header>

      {isAdmin ? (
        <>
          <section className="mb-8 rounded-lg border border-vice-border bg-vice-surface p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">
              Volgende stap
            </p>
            <h2 className="mt-2 text-lg font-medium text-vice-text">
              Verzamel bronnen of nodig de klant uit
            </h2>
            <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
              Start met een compacte meeting-opname; transcriptie en audit volgen later.
            </p>
          </section>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="mb-4 text-lg font-medium">Gegevens</h2>
              <TenantForm mode="edit" tenant={tenant} />
            </div>
            <TenantAdminPanel tenant={tenant} />
          </div>
        </>
      ) : (
        <>
          {publishedBcg ? <BcgPublishedView data={publishedBcg} /> : null}
          {publishedStp ? <StpPublishedView data={publishedStp} /> : null}
          {publishedPersonas ? <PersonaPublishedView data={publishedPersonas} /> : null}
          <EmptyState
            title="Strategisch dashboard"
            description="Na afronding van de audit en vrijgave door Hardwig zie je hier je goedgekeurde strategie. Een gepubliceerde BCG-matrix, een ICP en de persona’s met hun klantreis verschijnen hierboven."
          />
        </>
      )}
    </div>
  );
}
