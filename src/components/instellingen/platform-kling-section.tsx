"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PlatformKlingPublicStatus } from "@/modules/integrations/platform-kling-actions";
import { topUpPlatformKlingCreditsAction } from "@/modules/integrations/platform-kling-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function PlatformKlingSection({ status }: { status: PlatformKlingPublicStatus }) {
  const [balance, setBalance] = useState(status.unitsBalance);
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function topUp() {
    const amount = Number(units.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Voer een geldig aantal units in.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await topUpPlatformKlingCreditsAction(amount, note);
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Top-up mislukt" : result.error);
      return;
    }
    setBalance(result.data.unitsBalance);
    setUnits("");
    setNote("");
  }

  return (
    <section className="mt-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <h2 className="text-lg font-medium text-vice-text">Video — Kling credits</h2>
      <p className="mt-2 text-sm text-vice-text-muted">
        Image-to-video gebruikt je Kling resource package. Laad hier het saldo bij wanneer je units hebt
        gekocht bij Kling (geen vast VICE-abonnement).
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-vice-text-muted">API-key (server)</dt>
          <dd>{status.apiKeyConfigured ? "Geconfigureerd" : "KLING_API_KEY ontbreekt"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-vice-text-muted">Saldo in VICE</dt>
          <dd className="font-medium tabular-nums">{balance.toFixed(2)} units</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-vice-text-muted">Units toevoegen</Label>
          <input
            className={`${fieldClass} mt-1`}
            inputMode="decimal"
            placeholder="bv. 100"
            value={units}
            disabled={busy}
            onChange={(e) => setUnits(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-vice-text-muted">Notitie (optioneel)</Label>
          <input
            className={`${fieldClass} mt-1`}
            placeholder="Resource package okt 2026"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      <Button type="button" className="mt-4" disabled={busy} onClick={() => void topUp()}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Saldo bijladen
      </Button>
    </section>
  );
}
