import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getUserAppContext } from "@/lib/auth/context";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import {
  MARKETING_5C_FRAMEWORK_INDEX,
  MARKETING_5C_LABEL,
} from "@/lib/marketing-5c/constants";
import { PORTER_FRAMEWORK_INDEX } from "@/lib/porter/constants";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

export default async function Marketing5CPage({
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
        <Link href={`/klanten/${tenantId}/strategie/porter`} className="hover:text-vice-gold">
          ← Porter
        </Link>
        {" · "}
        Klanten / {tenantName} / Strategie
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
        Stap {MARKETING_5C_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · {MARKETING_5C_LABEL}
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">
        Marketingmix en merkpositionering
      </h1>
      <p className="mt-4 text-sm text-vice-text-muted">
        Porter is afgerond. De volledige 5C-workbench (Company, Collaborators, Customers,
        Competitors, Context) bouwen we in de volgende sprint. Je kunt alvast terug naar Porter of
        PESTEL.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" asChild variant="secondary">
          <Link href={`/klanten/${tenantId}/strategie/porter`}>
            Terug naar stap {PORTER_FRAMEWORK_INDEX} (Porter)
          </Link>
        </Button>
        <Button type="button" asChild variant="secondary">
          <Link href={`/klanten/${tenantId}/strategie/pestel`}>PESTEL bekijken</Link>
        </Button>
      </div>
    </div>
  );
}
