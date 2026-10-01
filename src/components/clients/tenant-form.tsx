"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenantAction,
  updateTenantAction,
} from "@/modules/clients/actions";
import type { TenantRow } from "@/lib/types/tenant";

type Props =
  | { mode: "create"; tenant?: undefined }
  | { mode: "edit"; tenant: TenantRow };

export function TenantForm({ mode, tenant }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      website: String(fd.get("website") ?? ""),
      vatNumber: String(fd.get("vatNumber") ?? ""),
      contactName: String(fd.get("contactName") ?? ""),
      contactEmail: String(fd.get("contactEmail") ?? ""),
      auditGoal: String(fd.get("auditGoal") ?? ""),
      language: String(fd.get("language") ?? "nl"),
    };

    const result =
      mode === "create"
        ? await createTenantAction(payload)
        : await updateTenantAction(tenant.id, payload);

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (mode === "create" && result.data?.id) {
      router.push(`/klanten/${result.data.id}`);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-vice-border bg-vice-surface p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Bedrijfsnaam *</Label>
        <Input id="name" name="name" required defaultValue={tenant?.name ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" type="url" defaultValue={tenant?.website ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vatNumber">BTW-nummer</Label>
          <Input
            id="vatNumber"
            name="vatNumber"
            inputMode="text"
            autoComplete="off"
            placeholder="BE0123456789"
            defaultValue={tenant?.vat_number ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactName">Contactpersoon</Label>
          <Input id="contactName" name="contactName" defaultValue={tenant?.contact_name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactEmail">E-mail contact</Label>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={tenant?.contact_email ?? ""}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="auditGoal">Auditdoel</Label>
        <textarea
          id="auditGoal"
          name="auditGoal"
          rows={3}
          defaultValue={tenant?.audit_goal ?? ""}
          className="w-full rounded-md border border-vice-border bg-vice-surface px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="language">Taal</Label>
        <Input id="language" name="language" defaultValue={tenant?.language ?? "nl"} />
      </div>
      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Opslaan…" : mode === "create" ? "Klant aanmaken" : "Wijzigingen opslaan"}
      </Button>
    </form>
  );
}
