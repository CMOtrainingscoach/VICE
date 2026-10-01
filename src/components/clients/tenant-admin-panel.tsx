"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveTenantAction,
  createInviteAction,
  requestDeletionAction,
} from "@/modules/clients/actions";
import type { TenantRow } from "@/lib/types/tenant";

export function TenantAdminPanel({ tenant }: { tenant: TenantRow }) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  async function sendInvite() {
    setError(null);
    setMessage(null);
    const result = await createInviteAction({
      tenantId: tenant.id,
      email: inviteEmail,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInviteLink(result.data?.inviteLink ?? null);
    setMessage("Uitnodiging aangemaakt. Deel de link veilig met de klant.");
  }

  async function toggleArchive() {
    const archived = tenant.status !== "archived";
    const result = await archiveTenantAction(tenant.id, archived);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function requestDeletion() {
    setError(null);
    const result = await requestDeletionAction({
      tenantId: tenant.id,
      confirmPhrase: "VERWIJDER",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("Verwijderverzoek geregistreerd (graceperiode 30 dagen, uitvoering fase 4).");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="mb-4 text-lg font-medium">Klant uitnodigen</h2>
        <div className="space-y-2">
          <Label htmlFor="inviteEmail">E-mail klant</Label>
          <Input
            id="inviteEmail"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </div>
        <Button type="button" className="mt-4" onClick={sendInvite}>
          Uitnodiging aanmaken
        </Button>
        {inviteLink && (
          <p className="mt-3 break-all text-xs text-vice-text-muted">
            Link (eenmalig, 7 dagen): {inviteLink}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="mb-4 text-lg font-medium">Archief</h2>
        <Button type="button" variant="secondary" onClick={toggleArchive}>
          {tenant.status === "archived" ? "Herstellen uit archief" : "Archiveren"}
        </Button>
      </section>

      <section className="rounded-lg border border-vice-border bg-vice-surface p-6">
        <h2 className="mb-2 text-lg font-medium text-vice-danger">Definitief verwijderen</h2>
        <p className="mb-4 text-sm text-vice-text-muted">
          Typ VERWIJDER om een verwijderverzoek te starten. Definitieve uitvoering gebeurt
          gecontroleerd in een latere fase.
        </p>
        <Input
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          placeholder="VERWIJDER"
          aria-label="Bevestigingstekst"
        />
        <Button
          type="button"
          variant="danger"
          className="mt-4"
          disabled={confirmDelete !== "VERWIJDER"}
          onClick={requestDeletion}
        >
          Verwijderverzoek indienen
        </Button>
      </section>

      {message && (
        <p className="text-sm text-vice-text" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
