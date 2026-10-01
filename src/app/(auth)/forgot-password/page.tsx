"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/auth/callback?next=/instellingen`,
    });
    if (resetError) {
      setError("Versturen mislukt. Probeer later opnieuw.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="rounded-xl border border-vice-border bg-vice-surface p-8">
      <h1 className="mb-2 text-lg font-medium">Wachtwoord herstellen</h1>
      <p className="mb-6 text-sm text-vice-text-muted">
        Je ontvangt een link per e-mail als dit adres bij ons bekend is.
      </p>
      {sent ? (
        <p className="text-sm text-vice-text">Controleer je inbox.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-vice-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full">
            Verstuur link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-vice-gold hover:underline">
          Terug naar inloggen
        </Link>
      </p>
    </div>
  );
}
