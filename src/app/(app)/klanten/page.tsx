import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { TENANT_STATUS_LABELS, type TenantRow } from "@/lib/types/tenant";

export default async function KlantenListPage({
  searchParams,
}: PageProps<"/klanten">) {
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) {
    redirect(ctx?.clientTenant ? `/klanten/${ctx.clientTenant.id}` : "/login");
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";

  const supabase = await createClient();
  const query = supabase
    .schema("app")
    .from("my_tenants")
    .select("*")
    .order("updated_at", { ascending: false });

  const { data } = await query;
  let rows = (data ?? []) as TenantRow[];
  if (q) {
    rows = rows.filter((t) => {
      const hay = `${t.name} ${t.vat_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  return (
    <div className="p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-vice-text">Klanten</h1>
          <p className="mt-1 text-sm text-vice-text-muted">
            Zoeken, status en volgende stap — geen salespipeline.
          </p>
        </div>
        <Button asChild>
          <Link href="/klanten/nieuw">Klant toevoegen</Link>
        </Button>
      </header>

      <form className="mb-6 max-w-md" method="get">
        <label htmlFor="q" className="sr-only">
          Zoeken
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Zoek op bedrijfsnaam of BTW-nummer…"
          className="w-full rounded-md border border-vice-border bg-vice-surface px-3 py-2 text-sm"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "Geen resultaten" : "Nog geen klanten"}
          description={
            q
              ? "Pas je zoekterm aan of maak een nieuwe klant aan."
              : "Start met een klantprofiel en auditdoel."
          }
          action={
            !q ? (
              <Button asChild>
                <Link href="/klanten/nieuw">Klant aanmaken</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-vice-border bg-vice-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-vice-border bg-vice-surface-muted/50 text-vice-text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Bedrijf</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">BTW-nummer</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Laatste update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-vice-border last:border-0">
                  <td className="px-5 py-3">
                    <Link
                      href={`/klanten/${t.id}`}
                      className="font-medium text-vice-text hover:text-vice-gold"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="hidden px-5 py-3 font-mono text-xs text-vice-text-muted md:table-cell">
                    {t.vat_number?.trim() || "—"}
                  </td>
                  <td className="px-5 py-3 text-vice-text-muted">
                    {TENANT_STATUS_LABELS[t.status]}
                  </td>
                  <td className="px-5 py-3 text-vice-text-muted">
                    {new Date(t.updated_at).toLocaleDateString("nl-BE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
