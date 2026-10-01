import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BootstrapForm } from "./bootstrap-form";

export default async function BootstrapPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect("/login");
  }

  const { data: status } = await supabase.schema("app").rpc("get_auth_status");
  const adminCount = (status as { admin_count?: number })?.admin_count ?? 0;
  if (adminCount > 0) {
    redirect("/vandaag");
  }

  return (
    <div className="rounded-xl border border-vice-border bg-vice-surface p-8">
      <h1 className="mb-2 text-lg font-medium">Platformbeheerder instellen</h1>
      <p className="mb-6 text-sm text-vice-text-muted">
        Eenmalige stap: koppel dit account als Hardwig-beheerder. Daarna is MFA
        verplicht.
      </p>
      <BootstrapForm />
    </div>
  );
}
