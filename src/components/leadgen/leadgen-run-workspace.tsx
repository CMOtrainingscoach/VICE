"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadgenProspectDrawer } from "@/components/leadgen/leadgen-prospect-drawer";
import { LEADGEN_FIXTURE_BANNER, leadgenFixturesEnabled } from "@/lib/leadgen/fixtures";
import {
  CONTACT_STATUS_LABELS,
  RUN_STATUS_LABELS,
  type LeadgenProspectRow,
  type LeadgenRunDetail,
} from "@/lib/leadgen/types";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import {
  cancelLeadgenRunAction,
  ensureLeadgenWorkerAction,
  getLeadgenRunAction,
  listLeadgenProspectsAction,
  updateLeadgenProspectStatusAction,
} from "@/modules/leadgen/actions";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function LeadgenRunWorkspace({
  tenantId,
  tenantName,
  initialRun,
  initialProspects,
}: {
  tenantId: string;
  tenantName: string;
  initialRun: LeadgenRunDetail;
  initialProspects: LeadgenProspectRow[];
}) {
  const [run, setRun] = useState(initialRun);
  const [prospects, setProspects] = useState(initialProspects);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const isActive = ACTIVE_STATUSES.has(run.status);

  const refreshRun = useCallback(async () => {
    const result = await getLeadgenRunAction(run.id);
    if (result.ok && result.data) setRun(result.data);
  }, [run.id]);

  const refreshProspects = useCallback(async () => {
    const result = await listLeadgenProspectsAction(run.id, { search, status: statusFilter });
    if (result.ok && result.data) setProspects(result.data);
  }, [run.id, search, statusFilter]);

  useEffect(() => {
    if (run.status === "queued") {
      void ensureLeadgenWorkerAction(run.id);
    }
  }, [run.id, run.status]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      void refreshRun();
      void refreshProspects();
    }, 2500);
    return () => clearInterval(timer);
  }, [isActive, refreshProspects, refreshRun]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshProspects();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, refreshProspects]);

  const filtered = useMemo(() => prospects, [prospects]);

  async function onCancel() {
    if (!window.confirm("Zoektocht stoppen? Reeds gevonden resultaten blijven bewaard.")) return;
    setCancelling(true);
    const result = await cancelLeadgenRunAction(run.id);
    setCancelling(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) setRun(result.data);
  }

  async function onRowStatusChange(prospectId: string, status: LeadgenProspectRow["contactStatus"]) {
    const result = await updateLeadgenProspectStatusAction(prospectId, status);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setProspects((prev) => prev.map((p) => (p.id === prospectId ? { ...p, contactStatus: status } : p)));
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Leadgen / {run.name}
      </p>

      {leadgenFixturesEnabled() || run.isFixture ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{LEADGEN_FIXTURE_BANNER}</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-vice-text">{run.name}</h1>
          <p className="mt-2 text-sm text-vice-text-muted">
            {run.config.locationLabel} · {run.config.radiusKm} km · {RUN_STATUS_LABELS[run.status]} · {run.resultCount}{" "}
            resultaten
          </p>
          <p className="mt-1 max-w-2xl text-xs text-vice-text-muted">{run.config.assignmentText}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isActive ? (
            <Button type="button" variant="secondary" disabled={cancelling} onClick={() => void onCancel()}>
              {cancelling ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Stop zoeken
            </Button>
          ) : null}
          <Button type="button" variant="secondary" asChild>
            <Link
              href={`${leadgenBasePath(tenantId)}/nieuw`}
              onClick={() => {
                try {
                  sessionStorage.setItem("leadgen-clone-config", JSON.stringify(run.config));
                } catch {
                  /* ignore */
                }
              }}
            >
              Opnieuw zoeken
            </Link>
          </Button>
        </div>
      </div>

      {isActive ? (
        <div className="mt-6 rounded-xl border border-vice-border bg-vice-surface p-5" role="status" aria-live="polite">
          <p className="text-sm font-medium">{run.progress.message || "Bezig…"}</p>
          <p className="mt-1 text-xs text-vice-text-muted">
            Fase: {run.progress.phase} · Gevonden {run.progress.discovered ?? 0} · Beoordeeld {run.progress.assessed ?? 0} ·
            Gekwalificeerd {run.progress.qualified ?? 0}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-vice-border">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-vice-gold" />
          </div>
          {run.resultCount > 0 ? (
            <p className="mt-3 text-sm">
              <button type="button" className="text-vice-gold underline" onClick={() => document.getElementById("leadgen-results")?.scrollIntoView({ behavior: "smooth" })}>
                Bekijk resultaten
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {run.errorMessage ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {run.errorMessage}
        </p>
      ) : null}

      <section id="leadgen-results" className="mt-10">
        <h2 className="font-display text-2xl text-vice-text">Potentiële klanten</h2>
        <p className="mt-1 text-xs text-vice-text-muted">
          Contactstatus is actueel; onderzoeksdata komt uit deze run.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder="Zoek bedrijf…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Zoek bedrijf"
          />
          <select
            className="rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter contactstatus"
          >
            <option value="">Alle statussen</option>
            {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-8 text-sm text-vice-text-muted">
            {isActive ? "Nog geen gekwalificeerde resultaten — even geduld." : "Geen resultaten voor deze filters."}
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-vice-border text-left text-xs uppercase text-vice-text-muted">
                  <th className="py-2 pr-4">Bedrijf</th>
                  <th className="py-2 pr-4">Afstand</th>
                  <th className="py-2 pr-4">Contact</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.runProspectId}
                    className="cursor-pointer border-b border-vice-border/60 hover:bg-vice-surface/80"
                    onClick={() => setSelectedProspectId(row.id)}
                  >
                    <td className="py-3 pr-4">
                      <span className="font-medium text-vice-text">{row.displayName}</span>
                      <p className="text-xs text-vice-text-muted">
                        {row.municipality ?? "—"}
                        {!row.geoVerified ? " · locatie niet geverifieerd" : ""}
                      </p>
                    </td>
                    <td className="py-3 pr-4">{row.distanceKm != null ? `${row.distanceKm} km` : "—"}</td>
                    <td className="py-3 pr-4 text-xs">{row.email ?? row.phone ?? "—"}</td>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <label className="sr-only" htmlFor={`status-${row.id}`}>
                        Status {row.displayName}
                      </label>
                      <select
                        id={`status-${row.id}`}
                        className="rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-xs"
                        value={row.contactStatus}
                        onChange={(e) => void onRowStatusChange(row.id, e.target.value as LeadgenProspectRow["contactStatus"])}
                      >
                        {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedProspectId ? (
        <LeadgenProspectDrawer runId={run.id} prospectId={selectedProspectId} onClose={() => setSelectedProspectId(null)} />
      ) : null}
    </div>
  );
}
