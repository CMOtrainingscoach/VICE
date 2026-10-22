"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { LEADGEN_FIXTURE_BANNER, leadgenFixturesEnabled } from "@/lib/leadgen/fixtures";
import { RUN_STATUS_LABELS, type LeadgenRunSummary } from "@/lib/leadgen/types";
import { deleteLeadgenRunAction, renameLeadgenRunAction } from "@/modules/leadgen/actions";

export function LeadgenRunList({
  tenantId,
  tenantName,
  initialRuns,
  mapsApiKey,
}: {
  tenantId: string;
  tenantName: string;
  initialRuns: LeadgenRunSummary[];
  mapsApiKey: string | null;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    return runs.filter((run) => {
      if (statusFilter && run.status !== statusFilter) return false;
      if (search && !run.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [runs, search, statusFilter]);

  async function onDelete(runId: string) {
    if (!window.confirm("Zoektocht verwijderen?\n\nDeze zoektocht en de bijbehorende resultatenlijst worden verwijderd. Bedrijven die ook in andere zoektochten voorkomen, blijven daar beschikbaar.")) {
      return;
    }
    setBusy(runId);
    const result = await deleteLeadgenRunAction(tenantId, runId);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRuns((prev) => prev.filter((r) => r.id !== runId));
    router.refresh();
  }

  async function onRename(runId: string, name: string) {
    const result = await renameLeadgenRunAction(runId, name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, name: result.data!.name } : r)));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Content / Leadgen
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-vice-text">Leadgen</h1>
          <p className="mt-2 text-sm text-vice-text-muted">Vind relevante bedrijven in jouw werkgebied.</p>
        </div>
        <Button asChild>
          <Link href={`/klanten/${tenantId}/content/leadgen/nieuw`}>
            <Plus className="size-4" aria-hidden />
            Nieuwe zoektocht
          </Link>
        </Button>
      </div>

      {leadgenFixturesEnabled() ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          {LEADGEN_FIXTURE_BANNER}
        </p>
      ) : null}

      {!mapsApiKey ? (
        <p className="mt-4 text-xs text-vice-text-muted">Tip: configureer NEXT_PUBLIC_GOOGLE_MAPS_API_KEY voor kaart en autocomplete.</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Zoek op naam…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Zoek op naam"
        />
        <select
          className="rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter op status"
        >
          <option value="">Alle statussen</option>
          {Object.entries(RUN_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Nog geen zoektochten"
          description="Start een nieuwe zoektocht om potentiële klanten te vinden."
          action={
            <Button asChild variant="secondary">
              <Link href={`/klanten/${tenantId}/content/leadgen/nieuw`}>Nieuwe zoektocht</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {filtered.map((run) => (
            <li
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vice-border bg-vice-surface px-4 py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/klanten/${tenantId}/content/leadgen/${run.id}`}
                  className="font-medium text-vice-text hover:text-vice-gold"
                >
                  {run.name}
                </Link>
                <p className="mt-1 text-xs text-vice-text-muted">
                  {run.locationLabel} · {run.radiusKm} km · {run.resultCount} resultaten ·{" "}
                  {RUN_STATUS_LABELS[run.status]} · {new Date(run.createdAt).toLocaleDateString("nl-BE")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs"
                  onClick={() => {
                    const name = window.prompt("Naam van zoektocht", run.name);
                    if (name) void onRename(run.id, name);
                  }}
                >
                  Hernoemen
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy === run.id}
                  aria-label="Verwijderen"
                  onClick={() => void onDelete(run.id)}
                >
                  {busy === run.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
