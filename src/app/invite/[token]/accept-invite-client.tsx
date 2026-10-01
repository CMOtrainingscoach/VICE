"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptInviteAction } from "@/modules/clients/actions";
import { Button } from "@/components/ui/button";

export function AcceptInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    setError(null);
    const result = await acceptInviteAction(token);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(`/klanten/${result.data?.tenantId}`);
    router.refresh();
  }

  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border border-vice-border bg-vice-surface p-8">
      <h1 className="mb-2 text-lg font-medium">Uitnodiging accepteren</h1>
      <p className="mb-6 text-sm text-vice-text-muted">
        Je krijgt toegang tot de klantomgeving van VICE.
      </p>
      {error && (
        <p className="mb-4 text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="button" className="w-full" onClick={accept} disabled={loading}>
        {loading ? "Bezig…" : "Uitnodiging accepteren"}
      </Button>
    </div>
  );
}
