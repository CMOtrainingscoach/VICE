"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import type { SbWorkflowSummary } from "@/lib/salesbrain/types";
import {
  archiveSbWorkflowAction,
  createSbWorkflowAction,
  restoreSbWorkflowAction,
} from "@/modules/salesbrain/actions";

const STATUS_LABEL: Record<string, string> = {
  draft: "Concept",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
};

export function SalesbrainWorkflowsList({
  tenantId,
  tenantName,
  workflows,
  showArchived,
}: {
  tenantId: string;
  tenantName: string;
  workflows: SbWorkflowSummary[];
  showArchived: boolean;
}) {
  const router = useRouter();
  const base = leadgenBasePath(tenantId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPurpose, setNewPurpose] = useState("");

  async function onCreate() {
    setBusy(true);
    setError("");
    const result = await createSbWorkflowAction(tenantId, {
      name: newName || "Nieuwe workflow",
      purpose: newPurpose,
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Aanmaken mislukt" : result.error);
      return;
    }
    router.push(`${base}/workflows/${result.data.id}`);
  }

  async function onArchive(id: string) {
    if (!confirm("Workflow archiveren? Klanten zien deze niet meer in de lijst.")) return;
    const result = await archiveSbWorkflowAction(tenantId, id);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  async function onRestore(id: string) {
    const result = await restoreSbWorkflowAction(tenantId, id);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Salesbrain / Workflows
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-vice-text">Workflows</h1>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link href={base}>Terug naar Salesbrain</Link>
          </Button>
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            Nieuwe workflow
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {showCreate ? (
        <div className="mt-6 rounded-xl border border-vice-border bg-vice-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="wf-name">Naam</Label>
              <Input id="wf-name" className="mt-1.5" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bijv. Groeisignalen marketeer" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="wf-purpose">Doel (optioneel)</Label>
              <Input id="wf-purpose" className="mt-1.5" value={newPurpose} onChange={(e) => setNewPurpose(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void onCreate()}>
              Aanmaken & bewerken
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="mt-8 space-y-3">
        {workflows.length === 0 ? (
          <li className="text-sm text-vice-text-muted">Geen workflows{showArchived ? "" : " (gearchiveerde verborgen)"}.</li>
        ) : (
          workflows.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vice-border bg-vice-surface px-4 py-4">
              <div>
                <p className="font-medium">{w.name}</p>
                <p className="mt-1 text-sm text-vice-text-muted">{w.purpose || "—"}</p>
                <p className="mt-1 text-xs text-vice-text-muted">
                  {STATUS_LABEL[w.status] ?? w.status}
                  {w.publishedVersionId ? " · versie gepubliceerd" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {w.status !== "archived" ? (
                  <Button asChild variant="secondary">
                    <Link href={`${base}/workflows/${w.id}`}>Bewerken</Link>
                  </Button>
                ) : null}
                {w.status === "archived" ? (
                  <Button type="button" variant="secondary" onClick={() => void onRestore(w.id)}>
                    Herstellen
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={() => void onArchive(w.id)}>
                    Archiveren
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      <p className="mt-6 text-xs text-vice-text-muted">
        {showArchived ? (
          <Link href={`${base}/workflows`} className="text-vice-gold underline">
            Verberg gearchiveerde
          </Link>
        ) : (
          <Link href={`${base}/workflows?archived=1`} className="text-vice-gold underline">
            Toon gearchiveerde workflows
          </Link>
        )}
      </p>
    </div>
  );
}
