"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let supabase;
    try {
      supabase = createClient();
    } catch (configError) {
      setError(
        configError instanceof Error
          ? configError.message
          : "Supabase-configuratie ontbreekt. Controleer .env.local.",
      );
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Inloggen mislukt. Controleer je gegevens.");
      setLoading(false);
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      router.push(`/mfa/verify?next=${encodeURIComponent(nextPath)}`);
      router.refresh();
      return;
    }

    const { data: status, error: statusError } = await supabase
      .schema("app")
      .rpc("get_auth_status");

    if (statusError) {
      setError(
        "Database-schema app is nog niet actief. In Supabase: Settings → API → Exposed schemas → voeg app toe, en voer de migraties uit (zie docs/SUPABASE_SETUP.md).",
      );
      setLoading(false);
      return;
    }

    const adminCount = (status as { admin_count?: number })?.admin_count ?? 0;
    if (adminCount === 0) {
      router.push("/bootstrap");
    } else {
      router.push(nextPath);
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Wachtwoord</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Bezig…" : "Inloggen"}
      </Button>
    </form>
  );
}
