"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { topUpTenantVideoWalletAction } from "@/modules/integrations/platform-openart-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function TenantVideoCreditsPanel({
  tenantId,
  initialBalance,
}: {
  tenantId: string;
  initialBalance: number;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function topUp() {
    const amount = Number(delta.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Voer een geldig tegoed in.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await topUpTenantVideoWalletAction({ tenantId, delta: amount, note });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Bijladen mislukt" : result.error);
      return;
    }
    setBalance(result.data.creditsBalance);
    setDelta("");
    setNote("");
  }

  return (
    <section className="mb-6 rounded-lg border border-dashed border-vice-border bg-vice-surface/60 p-4">
      <h2 className="text-sm font-medium text-vice-text">Klant video-tegoed (facturatie)</h2>
      <p className="mt-1 text-xs text-vice-text-muted">
        Handmatig bijladen voor deze klant. Bij elke succesvolle render wordt ~geschatte credits afgetrokken.
      </p>
      <p className="mt-2 text-sm">
        Saldo: <span className="font-medium tabular-nums">{balance.toFixed(2)}</span> credits
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs text-vice-text-muted">Toevoegen</Label>
          <input
            className={`${fieldClass} mt-1`}
            inputMode="decimal"
            placeholder="bv. 20"
            value={delta}
            disabled={busy}
            onChange={(e) => setDelta(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-vice-text-muted">Notitie</Label>
          <input
            className={`${fieldClass} mt-1`}
            placeholder="Factuur #…"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <Button type="button" className="mt-3" variant="secondary" disabled={busy} onClick={() => void topUp()}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Tegoed bijladen"}
      </Button>
    </section>
  );
}
