"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlatformGoogleAdsPublicStatus } from "@/lib/integrations/platform-google-ads";
import {
  disconnectPlatformGoogleAdsAction,
  updatePlatformGoogleAdsAccountsAction,
} from "@/modules/integrations/platform-google-ads-actions";

const FLASH: Record<string, string> = {
  connected: "Google Ads gekoppeld. Vul hieronder het customer ID in voor Keyword Planner.",
  denied: "Google-toegang geweigerd.",
  invalid: "Ongeldige OAuth-terugkoppeling.",
  state: "OAuth-sessie verlopen. Probeer opnieuw.",
  forbidden: "Geen rechten om Google Ads te koppelen.",
  token: "Token uitwisselen mislukt. Controleer redirect URI in Google Cloud.",
  save: "Opslaan in database mislukt.",
  "no-refresh": "Geen refresh token ontvangen. Koppel opnieuw (Google vraagt soms opnieuw om consent).",
  "not-configured": "GOOGLE_CLIENT_ID/SECRET ontbreken in de omgeving.",
};

export function PlatformGoogleAdsSection({
  status,
  oauthReady,
  initialFlash,
  envCustomerId,
}: {
  status: PlatformGoogleAdsPublicStatus;
  oauthReady: boolean;
  initialFlash?: string | null;
  envCustomerId: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(
    status.customerId || envCustomerId.replace(/\D/g, ""),
  );
  const [loginCustomerId, setLoginCustomerId] = useState(status.loginCustomerId.replace(/\D/g, ""));
  const [message, setMessage] = useState(initialFlash ? FLASH[initialFlash] ?? null : null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function saveAccounts() {
    setBusy("save");
    setError("");
    setMessage(null);
    const result = await updatePlatformGoogleAdsAccountsAction({
      customerId,
      loginCustomerId: loginCustomerId || undefined,
    });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("Ads-accountgegevens opgeslagen.");
    router.refresh();
  }

  async function disconnect() {
    if (!confirm("Google Ads platformkoppeling verbreken?")) return;
    setBusy("disconnect");
    setError("");
    const result = await disconnectPlatformGoogleAdsAction();
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("Google Ads ontkoppeld.");
    router.refresh();
  }

  const connected = status.connected;

  return (
    <section className="mt-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <h2 className="text-lg font-semibold text-vice-text">Platform · Google Ads</h2>
      <p className="mt-1 text-sm text-vice-text-muted">
        Keyword Planner voor alle klanten (Zoekwoorden-tab). OAuth via VICE — geen OAuth Playground nodig.
      </p>

      {message ? (
        <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-950 dark:text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {status.lastError ? (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">Laatste fout: {status.lastError}</p>
      ) : null}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-vice-text-muted">OAuth-client</dt>
          <dd>{oauthReady ? "Geconfigureerd" : "GOOGLE_CLIENT_ID/SECRET ontbreekt"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-vice-text-muted">Koppeling</dt>
          <dd>
            {connected ? (
              <>
                Verbonden als <span className="font-medium">{status.accountEmail || "—"}</span>
              </>
            ) : (
              "Niet gekoppeld"
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {oauthReady ? (
          connected ? (
            <Button type="button" variant="secondary" disabled={busy === "disconnect"} onClick={disconnect}>
              Ontkoppelen
            </Button>
          ) : (
            <Button asChild>
              <Link href="/api/integrations/google-ads/connect">Koppel Google Ads</Link>
            </Button>
          )
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 border-t border-vice-border pt-6 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-vice-text-muted">Customer ID (Keyword Plan)</span>
          <Input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="1234567890"
            inputMode="numeric"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-vice-text-muted">Login customer ID (MCC, optioneel)</span>
          <Input
            value={loginCustomerId}
            onChange={(e) => setLoginCustomerId(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Optioneel"
            inputMode="numeric"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-vice-text-muted">
        Redirect URI in Google Cloud:{" "}
        <code className="text-[11px]">…/api/integrations/google-ads/callback</code>
      </p>
      <Button className="mt-4" type="button" disabled={busy === "save"} onClick={saveAccounts}>
        Ads-account opslaan
      </Button>
    </section>
  );
}
