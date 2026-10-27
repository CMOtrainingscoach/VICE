"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import { CONTACT_STATUS_LABELS, RUN_STATUS_LABELS, type LeadgenProspectRow } from "@/lib/leadgen/types";
import { SALESBRAIN_FIXTURE_BANNER } from "@/lib/salesbrain/fixtures";
import { salesbrainFixturesEnabled } from "@/lib/salesbrain/flags";
import type { SbRunDetail } from "@/lib/salesbrain/types";
import { SalesbrainProspectPanel } from "@/components/salesbrain/salesbrain-prospect-panel";
import {
  ensureSbWorkerAction,
  getSbRunAction,
  listSbInsightsAction,
  listSbProspectsAction,
} from "@/modules/salesbrain/actions";
import type { SbMarketInsight } from "@/lib/salesbrain/types";
import { updateLeadgenProspectStatusAction } from "@/modules/leadgen/actions";

const ACTIVE = new Set(["queued", "running"]);

export function SalesbrainRunWorkspace({
  tenantId,
  tenantName,
  initialRun,
  initialProspects,
}: {
  tenantId: string;
  tenantName: string;
  initialRun: SbRunDetail;
  initialProspects: LeadgenProspectRow[];
}) {
  const [run, setRun] = useState(initialRun);
  const [prospects, setProspects] = useState(initialProspects);
  const [insights, setInsights] = useState<SbMarketInsight[]>([]);
  const [selected, setSelected] = useState<LeadgenProspectRow | null>(null);
  const [tab, setTab] = useState<"prospects" | "insights" | "sources">("prospects");
  const isActive = ACTIVE.has(run.status);

  const refresh = useCallback(async () => {
    const [r, p, ins] = await Promise.all([
      getSbRunAction(run.id),
      listSbProspectsAction(run.id),
      listSbInsightsAction(run.id),
    ]);
    if (r.ok && r.data) setRun(r.data);
    if (p.ok && p.data) setProspects(p.data);
    if (ins.ok && ins.data) setInsights(ins.data);
  }, [run.id]);

  useEffect(() => {
    if (run.status === "queued") void ensureSbWorkerAction(run.id);
  }, [run.id, run.status]);

  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [isActive, refresh]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Salesbrain / {run.name}
      </p>
      {salesbrainFixturesEnabled() || run.isTest ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {run.isTest ? "Testmodus — geen productiestatus." : SALESBRAIN_FIXTURE_BANNER}
        </p>
      ) : null}

      <h1 className="mt-4 font-display text-3xl text-vice-text">{run.name}</h1>
      <p className="mt-2 text-sm text-vice-text-muted">
        {RUN_STATUS_LABELS[run.status as keyof typeof RUN_STATUS_LABELS] ?? run.status} · {run.prospectCount} prospects ·{" "}
        {run.insightCount} inzichten
      </p>

      {isActive ? (
        <div className="mt-6 rounded-xl border border-vice-border bg-vice-surface p-4" role="status">
          <p className="text-sm">{run.progress.message}</p>
          <p className="text-xs text-vice-text-muted">Fase: {run.progress.phase}</p>
        </div>
      ) : null}

      <div className="mt-6 flex gap-2 text-sm">
        {(["prospects", "insights", "sources"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-md border px-3 py-1 capitalize ${tab === t ? "border-vice-gold" : "border-vice-border"}`}
            onClick={() => setTab(t)}
          >
            {t === "prospects" ? "Prospects" : t === "insights" ? "Marktinzichten" : "Bronnen"}
          </button>
        ))}
      </div>

      {tab === "prospects" ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-vice-border text-left text-xs uppercase text-vice-text-muted">
                <th className="py-2">Bedrijf</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-vice-border/60 hover:bg-vice-surface/80"
                  onClick={() => setSelected(row)}
                >
                  <td className="py-3">{row.displayName}</td>
                  <td className="py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="rounded border border-vice-border bg-vice-bg px-2 py-1 text-xs"
                      value={row.contactStatus}
                      disabled={run.isTest}
                      onChange={(e) =>
                        void updateLeadgenProspectStatusAction(row.id, e.target.value as LeadgenProspectRow["contactStatus"]).then(
                          refresh,
                        )
                      }
                    >
                      {Object.entries(CONTACT_STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "insights" ? (
        <ul className="mt-6 space-y-4 text-sm">
          {insights.length === 0 ? (
            <li className="text-vice-text-muted">Geen marktinzichten in deze run.</li>
          ) : (
            insights.map((ins) => (
              <li key={ins.id} className="rounded-lg border border-vice-border p-4">
                <p className="font-medium">{ins.title}</p>
                <p className="mt-2 text-vice-text-muted">{ins.summary}</p>
                <p className="mt-2 text-xs text-vice-text-muted">Bron: {ins.provenance}</p>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "sources" ? (
        <p className="mt-6 text-sm text-vice-text-muted">Open een prospect voor signalen, beperkingen en bronverwijzingen.</p>
      ) : null}

      <Button asChild className="mt-8" variant="secondary">
        <Link href={leadgenBasePath(tenantId)}>Terug naar Salesbrain</Link>
      </Button>

      {selected ? (
        <SalesbrainProspectPanel
          tenantId={tenantId}
          runId={run.id}
          prospect={selected}
          isTest={run.isTest}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
