import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { TENANT_STATUS_LABELS, type TenantRow } from "@/lib/types/tenant";
import { Button } from "@/components/ui/button";

export default async function VandaagPage() {
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) {
    return (
      <div className="p-8">
        <EmptyState
          title="Welkom"
          description="Je klantomgeving opent via het menu. Strategische modules volgen in latere fases."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: tenants } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(8);

  const rows = (tenants ?? []) as TenantRow[];

  return (
    <div className="p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-vice-text">Vandaag</h1>
          <p className="mt-1 text-sm text-vice-text-muted">
            Overzicht van recente klantactiviteit en volgende stappen.
          </p>
        </div>
        <Button asChild>
          <Link href="/klanten/nieuw">Klant toevoegen</Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen klanten"
          description="Voeg je eerste klant toe om intake en audit later te starten."
          action={
            <Button asChild>
              <Link href="/klanten/nieuw">Eerste klant aanmaken</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-vice-border rounded-lg border border-vice-border bg-vice-surface">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/klanten/${t.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-vice-surface-muted/60"
              >
                <div>
                  <p className="font-medium text-vice-text">{t.name}</p>
                  <p className="text-sm text-vice-text-muted">
                    {TENANT_STATUS_LABELS[t.status]}
                  </p>
                </div>
                <span className="text-sm text-vice-gold">Openen →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
