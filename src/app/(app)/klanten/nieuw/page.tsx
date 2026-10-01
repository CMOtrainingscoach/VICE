import { redirect } from "next/navigation";
import { getUserAppContext } from "@/lib/auth/context";
import { TenantForm } from "@/components/clients/tenant-form";

export default async function NewTenantPage() {
  const ctx = await getUserAppContext();
  if (!ctx?.isPlatformAdmin) {
    redirect("/vandaag");
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-semibold text-vice-text">Klant toevoegen</h1>
      <p className="mb-8 text-sm text-vice-text-muted">
        Minimale gegevens; uitnodigen doe je bewust later per klant.
      </p>
      <TenantForm mode="create" />
    </div>
  );
}
