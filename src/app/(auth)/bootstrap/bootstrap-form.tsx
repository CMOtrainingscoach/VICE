"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bootstrapAdminAction } from "@/modules/clients/actions";
import { Button } from "@/components/ui/button";

export function BootstrapForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setLoading(true);
    setError(null);
    const result = await bootstrapAdminAction();
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push("/mfa/enroll");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="button" onClick={onConfirm} disabled={loading} className="w-full">
        {loading ? "Bezig…" : "Bevestig als beheerder"}
      </Button>
    </div>
  );
}
