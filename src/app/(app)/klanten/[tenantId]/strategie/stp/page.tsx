import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getUserAppContext } from "@/lib/auth/context";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { STP_FRAMEWORK_INDEX, VALUE_CHAIN_FRAMEWORK_INDEX, VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";

export default async function StpPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase.schema("app").from("my_tenants").select("name").eq("id", tenantId).maybeSingle();
  if (!tenantData) notFound();

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <p className="text-sm text-vice-text-muted">
        <Link href={`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`} className="hover:text-vice-gold">← Waardeketen</Link>
        {" · "}Klanten / {tenantName} / Strategie
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
        Stap {STP_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · STP
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">Segmentatie, targeting en positionering</h1>
      <p className="mt-4 text-sm text-vice-text-muted">
        De goedgekeurde waardeketen is de input voor STP. Deze workbench bouwen we in de volgende stap.
      </p>
      <div className="mt-8">
        <Button type="button" asChild variant="secondary">
          <Link href={`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`}>Terug naar stap {VALUE_CHAIN_FRAMEWORK_INDEX}</Link>
        </Button>
      </div>
    </div>
  );
}
