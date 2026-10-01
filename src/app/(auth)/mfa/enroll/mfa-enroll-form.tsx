"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaQrCode } from "./mfa-qr-code";

function formatSecretForDisplay(secret: string) {
  return secret.replace(/\s/g, "").match(/.{1,4}/g)?.join(" ") ?? secret;
}

async function clearPendingFactors(): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/auth/mfa/reset-pending", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    hadVerifiedTotp?: boolean;
  };
  if (!res.ok) {
    return { ok: false, message: body.error ?? "MFA-reset mislukt." };
  }
  if (body.hadVerifiedTotp) {
    return {
      ok: false,
      message:
        "Je hebt al een actieve MFA-factor. Gebruik je authenticator-app op /mfa/verify, of verwijder MFA in het Supabase-dashboard bij je gebruiker.",
    };
  }
  return { ok: true };
}

export function MfaEnrollForm() {
  const router = useRouter();
  const mountStarted = useRef(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const startEnrollment = useCallback(async (options?: { userInitiated?: boolean }) => {
    setLoading(true);
    setError(null);
    setTotpUri(null);
    setSecret(null);
    setFactorId(null);

    const cleared = await clearPendingFactors();
    if (!cleared.ok) {
      setLoading(false);
      setError(cleared.message ?? "Kon oude MFA-inschrijving niet wissen.");
      return;
    }

    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `VICE-${Date.now()}`,
    });

    setLoading(false);

    if (enrollError || !data?.totp) {
      setError(
        enrollError?.message ??
          "MFA inschrijven mislukt. Controleer of TOTP aan staat in Supabase (Auth → MFA).",
      );
      if (options?.userInitiated) {
        setError(
          (enrollError?.message ?? "Inschrijven mislukt") +
            " Probeer opnieuw of wis MFA bij Authentication → Users in Supabase.",
        );
      }
      return;
    }

    setFactorId(data.id);
    setTotpUri(data.totp.uri);
    setSecret(data.totp.secret);
  }, []);

  useEffect(() => {
    if (mountStarted.current) return;
    mountStarted.current = true;
    void startEnrollment();
  }, [startEnrollment]);

  async function onResetAndRetry() {
    setResetting(true);
    await startEnrollment({ userInitiated: true });
    setResetting(false);
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret.replace(/\s/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function verify() {
    if (!factorId) return;
    setError(null);
    const supabase = createClient();
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setError("Challenge mislukt.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s/g, ""),
    });
    if (verifyError) {
      setError("Ongeldige code. Wacht op een nieuwe code (30 s) en probeer opnieuw.");
      return;
    }
    await supabase.auth.refreshSession();
    router.push("/vandaag");
    router.refresh();
  }

  return (
    <>
      <p className="mb-6 text-sm text-vice-text-muted">
        Verplicht voor beheerders. Gebruik Google Authenticator (of vergelijkbaar).
        Werkt scannen niet? Kies in de app <strong>Setup key invoeren</strong> (tijdgebaseerd)
        en plak de sleutel hieronder.
      </p>

      {loading && (
        <p className="mb-4 text-sm text-vice-text-muted">QR-code voorbereiden…</p>
      )}

      {totpUri && <MfaQrCode uri={totpUri} />}

      {secret && (
        <div className="mt-4 space-y-2 rounded-lg border border-vice-border bg-vice-surface-muted p-4">
          <Label htmlFor="setup-key">Setup key (handmatig)</Label>
          <p
            id="setup-key"
            className="break-all font-mono text-sm tracking-wide text-vice-text"
          >
            {formatSecretForDisplay(secret)}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="py-1.5 text-xs"
            onClick={copySecret}
          >
            {copied ? "Gekopieerd" : "Kopieer sleutel"}
          </Button>
          <p className="text-xs text-vice-text-muted">
            Accountnaam in de app: <strong>VICE</strong> · Type: tijdgebaseerd (TOTP)
          </p>
        </div>
      )}

      {!loading && !totpUri && (
        <Button
          type="button"
          variant="secondary"
          className="mb-4 w-full"
          disabled={resetting}
          onClick={onResetAndRetry}
        >
          {resetting ? "Bezig…" : "Nieuwe QR-code aanvragen"}
        </Button>
      )}

      <div className="mt-6 space-y-2">
        <Label htmlFor="code">Verificatiecode (6 cijfers)</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </div>

      {error && (
        <p className="mt-3 text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}

      <Button
        type="button"
        className="mt-4 w-full"
        onClick={verify}
        disabled={!factorId || code.length < 6}
      >
        Activeer MFA
      </Button>

      {totpUri && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full text-xs"
          disabled={resetting}
          onClick={onResetAndRetry}
        >
          QR werkt niet? Opnieuw beginnen
        </Button>
      )}
    </>
  );
}
