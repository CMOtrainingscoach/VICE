"use client";

import Link from "next/link";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlatformOpenArtPublicStatus } from "@/lib/integrations/platform-openart";
import { disconnectPlatformOpenArtAction } from "@/modules/integrations/platform-openart-actions";

const FLASH: Record<string, string> = {
  connected: "OpenArt is gekoppeld.",
  denied: "OpenArt-autorisatie geannuleerd.",
  invalid: "Ongeldige OAuth-terugkoppeling.",
  state: "OAuth-sessie verlopen — probeer opnieuw.",
  forbidden: "Alleen platformbeheerders mogen OpenArt koppelen.",
  "no-refresh": "Geen refresh token — koppel opnieuw.",
  save: "Tokens opslaan mislukt (migratie?).",
  token: "Token exchange mislukt.",
  "not-configured": "OpenArt OAuth kon niet starten.",
};

export function PlatformOpenArtSection({
  status,
  initialFlash,
}: {
  status: PlatformOpenArtPublicStatus;
  initialFlash: string | null;
}) {
  const [connected, setConnected] = useState(status.connected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flash = initialFlash ? FLASH[initialFlash] : null;

  async function disconnect() {
    setBusy(true);
    setError("");
    const result = await disconnectPlatformOpenArtAction();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConnected(false);
  }

  return (
    <section className="mt-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <h2 className="text-lg font-medium text-vice-text">Video — OpenArt (platform)</h2>
      <p className="mt-2 text-sm text-vice-text-muted">
        Koppel je OpenArt-abonnement één keer. Gebruikers genereren video via dit account; jij
        factureert klanten via het video-tegoed per tenant (handmatig bijladen).
      </p>

      {flash ? <p className="mt-3 text-sm text-vice-gold">{flash}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-vice-text-muted">Status</dt>
          <dd>{connected ? "Gekoppeld" : "Niet gekoppeld"}</dd>
        </div>
        {status.accountEmail ? (
          <div className="flex justify-between gap-4">
            <dt className="text-vice-text-muted">Account</dt>
            <dd>{status.accountEmail}</dd>
          </div>
        ) : null}
        {status.projectId ? (
          <div className="flex justify-between gap-4">
            <dt className="text-vice-text-muted">Project</dt>
            <dd className="truncate font-mono text-xs">{status.projectId}</dd>
          </div>
        ) : null}
        {status.subscriptionActive ? (
          <div className="flex justify-between gap-4">
            <dt className="text-vice-text-muted">Abonnement</dt>
            <dd>Actief (unlimited waar beschikbaar)</dd>
          </div>
        ) : null}
        {status.openArtCredits != null ? (
          <div className="flex justify-between gap-4">
            <dt className="text-vice-text-muted">OpenArt credits (indicatie)</dt>
            <dd className="tabular-nums">{status.openArtCredits}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {connected ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void disconnect()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Ontkoppel OpenArt"}
          </Button>
        ) : (
          <Button asChild>
            <Link href="/api/integrations/openart/connect">Koppel OpenArt</Link>
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs text-vice-text-muted">
        Redirect URI voor OAuth:{" "}
        <code className="text-[11px]">…/api/integrations/openart/callback</code> (zelfde host als{" "}
        <code className="text-[11px]">NEXT_PUBLIC_APP_URL</code>).
      </p>
    </section>
  );
}
