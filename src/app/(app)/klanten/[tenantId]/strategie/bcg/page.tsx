import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getUserAppContext } from "@/lib/auth/context";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { BCG_FRAMEWORK_INDEX, VRIO_ROUTE } from "@/lib/vrio/constants";
import { VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

export default async function BcgPage({
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
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenantData) notFound();

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <p className="text-sm text-vice-text-muted">
        <Link href={`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`} className="hover:text-vice-gold">
          ← VRIO
        </Link>
        {" · "}
        Klanten / {tenantName} / Strategie
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
        Stap {BCG_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · BCG
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">BCG-matrix</h1>
      <p className="mt-4 text-sm text-vice-text-muted">
        De BCG-matrix zelf volgt nog. De waardeketen gebruikt een portfolio-onderdeel alleen wanneer die analyse er is,
        en kan nu al verder op het klantdossier, SWOT en VRIO.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Button type="button" asChild className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover">
          <Link href={`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`}>Naar de waardeketen →</Link>
        </Button>
        <Button type="button" asChild variant="secondary">
          <Link href={`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`}>Terug naar VRIO</Link>
        </Button>
      </div>
    </div>
  );
}
