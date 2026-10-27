"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import type { SbRunSummary } from "@/lib/salesbrain/types";
import { renameSbRunAction, softDeleteSbRunAction } from "@/modules/salesbrain/actions";

export function SalesbrainRunsList({
  tenantId,
  runs,
  isAdmin,
}: {
  tenantId: string;
  runs: SbRunSummary[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const base = leadgenBasePath(tenantId);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const visible = runs.filter((r) => !r.deletedAt);

  async function onDelete(runId: string) {
    if (!confirm("Run verwijderen? Prospects blijven bewaard; deze run verdwijnt uit de lijst.")) return;
    const result = await softDeleteSbRunAction(tenantId, runId);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  async function onSaveRename(runId: string) {
    const result = await renameSbRunAction(tenantId, runId, editName);
    if (!result.ok) setError(result.error);
    else {
      setEditingId(null);
      router.refresh();
    }
  }

  if (visible.length === 0) {
    return <p className="mt-4 text-sm text-vice-text-muted">Nog geen opgeslagen analyses.</p>;
  }

  return (
    <>
      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {visible.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-vice-border px-3 py-2">
            <div className="min-w-0 flex-1">
              {editingId === run.id ? (
                <div className="flex gap-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs" />
                  <Button type="button" variant="secondary" onClick={() => void onSaveRename(run.id)}>
                    Opslaan
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                    Annuleer
                  </Button>
                </div>
              ) : (
                <>
                  <Link href={`${base}/sb/${run.id}`} className="font-medium text-vice-gold underline">
                    {run.name}
                  </Link>
                  <p className="text-xs text-vice-text-muted">
                    {run.status} · {run.prospectCount} prospects
                    {run.workflowName ? ` · ${run.workflowName}` : ""}
                    {run.isTest ? " · test" : ""}
                  </p>
                </>
              )}
            </div>
            {isAdmin && editingId !== run.id ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    setEditingId(run.id);
                    setEditName(run.name);
                  }}
                >
                  Hernoemen
                </Button>
                <Button type="button" variant="ghost" className="text-xs" onClick={() => void onDelete(run.id)}>
                  Verwijderen
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
