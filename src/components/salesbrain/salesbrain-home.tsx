"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import { SALESBRAIN_FIXTURE_BANNER } from "@/lib/salesbrain/fixtures";
import { salesbrainFixturesEnabled } from "@/lib/salesbrain/flags";
import type { SbRunSummary, SbWorkflowSummary } from "@/lib/salesbrain/types";
import { SalesbrainRunsList } from "@/components/salesbrain/salesbrain-runs-list";
import { publishDefaultWorkflowAction } from "@/modules/salesbrain/actions";

export function SalesbrainHome({
  tenantId,
  tenantName,
  workflows,
  runs,
  isAdmin,
}: {
  tenantId: string;
  tenantName: string;
  workflows: SbWorkflowSummary[];
  runs: SbRunSummary[];
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = leadgenBasePath(tenantId);
  const published = workflows.filter((w) => w.status === "published" && w.publishedVersionId);

  async function onPublishDefault() {
    setBusy(true);
    const result = await publishDefaultWorkflowAction(tenantId);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else window.location.reload();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">{tenantName} / Salesbrain</p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-vice-text">Salesbrain</h1>
      <p className="mt-2 text-sm text-vice-text-muted">Client-specifieke sales-intelligence workflows.</p>

      {salesbrainFixturesEnabled() ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{SALESBRAIN_FIXTURE_BANNER}</p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`${base}/workflows`}>Workflows beheren</Link>
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void onPublishDefault()}>
            Publiceer standaardworkflow
          </Button>
          <Button asChild variant="ghost">
            <Link href={`${base}/legacy`}>Legacy Leadgen</Link>
          </Button>
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-2xl text-vice-text">Beschikbare workflows</h2>
        {published.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="Nog geen gepubliceerde workflow"
            description={isAdmin ? "Publiceer de standaardworkflow om te starten." : "Vraag je strategist om een workflow te publiceren."}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {published.map((w) => (
              <li key={w.id} className="rounded-xl border border-vice-border bg-vice-surface px-4 py-4">
                <p className="font-medium">{w.name}</p>
                <p className="mt-1 text-sm text-vice-text-muted">{w.purpose}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`${base}/start/${w.id}`}>Start analyse</Link>
                  </Button>
                  {isAdmin ? (
                    <>
                      <Button asChild variant="secondary">
                        <Link href={`${base}/workflows/${w.id}`}>Bewerken</Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href={`${base}/start/${w.id}?test=1`}>Test als klant</Link>
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl text-vice-text">Eerdere runs</h2>
        <SalesbrainRunsList tenantId={tenantId} runs={runs} isAdmin={isAdmin} />
      </section>
    </div>
  );
}
