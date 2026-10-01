"use client";

import {
  AlertTriangle,
  FileText,
  Loader2,
  Pencil,
  ShieldBan,
  Sparkles,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { MARKETING_5C_ROUTE } from "@/lib/marketing-5c/constants";
import {
  SWOT_FRAMEWORK_INDEX,
  SWOT_QUADRANT_META,
  SWOT_QUADRANTS,
  SWOT_STATUS_LABELS,
  type SwotQuadrant,
} from "@/lib/swot/constants";
import type { SwotItem, SwotWorkbench } from "@/lib/swot/types";
import {
  approveSwotVersionAction,
  generateSwotAiAction,
  loadSwotWorkbenchAction,
  saveSwotQuadrantAction,
  setSwotAdjustmentNoteAction,
  setSwotAdvisorReviewedAction,
} from "@/modules/swot/actions";
import { cn } from "@/lib/utils";

const QUADRANT_ICONS = {
  strength: User,
  weakness: ShieldBan,
  opportunity: TrendingUp,
  threat: AlertTriangle,
} as const;

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} minuten geleden`;
  return d.toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function SwotWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: SwotWorkbench;
}) {
  const [wb, setWb] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editQuadrant, setEditQuadrant] = useState<SwotQuadrant | null>(null);
  const [editText, setEditText] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustNote, setAdjustNote] = useState(initial.version.adjustment_note);
  const [savedAt, setSavedAt] = useState<string | null>(initial.version.updated_at);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const version = wb.version;
  const readOnly = version.status === "approved";
  const itemsByQ = useMemo(() => {
    const map: Record<SwotQuadrant, SwotItem[]> = {
      strength: [],
      weakness: [],
      opportunity: [],
      threat: [],
    };
    for (const i of wb.items) map[i.quadrant].push(i);
    for (const q of SWOT_QUADRANTS) map[q].sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [wb.items]);

  const sourceCount = useMemo(() => {
    const keys = new Set<string>();
    for (const i of wb.items) {
      for (const r of i.refs) keys.add(`${r.ref_type}:${r.ref_id ?? ""}`);
    }
    return keys.size;
  }, [wb.items]);

  const hasContent = wb.items.length > 0;
  const fiveCStale = Boolean(
    wb.upstream.latest_five_c_approved &&
      wb.version.five_c_version_id !== wb.upstream.latest_five_c_approved.id,
  );

  const reload = useCallback(async () => {
    const r = await loadSwotWorkbenchAction(tenantId);
    if (r.ok && r.data) {
      setWb(r.data);
      setSavedAt(r.data.version.updated_at);
    }
  }, [tenantId]);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Actie mislukt");
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(null);
    }
  }

  function openEdit(q: SwotQuadrant) {
    setEditQuadrant(q);
    setEditText(
      itemsByQ[q]
        .map((i) => i.statement)
        .join("\n")
        .trim(),
    );
  }

  const persistQuadrant = useCallback(
    async (q: SwotQuadrant, text: string) => {
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[-•*]\s*/, "").trim())
        .filter((l) => l.length >= 2);
      const prev = itemsByQ[q];
      const statements = lines.map((statement, idx) => ({
        statement,
        origin: prev[idx]?.origin ?? ("manual" as const),
        refs: prev[idx]?.refs ?? [],
      }));

      setBusy("autosave");
      const r = await saveSwotQuadrantAction(tenantId, {
        versionId: version.id,
        quadrant: q,
        statements,
      });
      setBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await reload();
      setSavedAt(new Date().toISOString());
    },
    [itemsByQ, reload, tenantId, version.id],
  );

  useEffect(() => {
    if (!editQuadrant || readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistQuadrant(editQuadrant, editText);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editText, editQuadrant, persistQuadrant, readOnly]);

  async function runAi(withAdjustment = false) {
    if (withAdjustment && adjustNote.trim().length >= 5) {
      await run("adjust", () =>
        setSwotAdjustmentNoteAction(tenantId, { versionId: version.id, note: adjustNote }),
      );
    }
    const ok = await run("ai", () =>
      generateSwotAiAction(tenantId, {
        versionId: version.id,
        adjustmentNote: withAdjustment ? adjustNote : undefined,
      }),
    );
    if (ok) setAdjustOpen(false);
  }

  async function approve() {
    const reviewed = await run("review", () =>
      setSwotAdvisorReviewedAction(tenantId, { versionId: version.id, reviewed: true }),
    );
    if (!reviewed) return;
    const fresh = await loadSwotWorkbenchAction(tenantId);
    const updatedAt = fresh.ok && fresh.data ? fresh.data.version.updated_at : wb.version.updated_at;
    await run("approve", () =>
      approveSwotVersionAction(tenantId, {
        versionId: version.id,
        expectedUpdatedAt: updatedAt,
      }),
    );
  }

  function renderQuadrantCard(q: SwotQuadrant) {
    const meta = SWOT_QUADRANT_META[q];
    const Icon = QUADRANT_ICONS[q];
    const items = itemsByQ[q];
    return (
      <article key={q} className={cn("flex flex-col rounded-2xl border p-5", meta.cardClass)}>
        <div className="flex items-start gap-3">
          <span className={cn("rounded-lg bg-white/40 p-2 dark:bg-black/20", meta.iconTone)}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-vice-text">{meta.label}</h2>
            <p className="text-xs text-vice-text-muted">{meta.subtitle}</p>
          </div>
        </div>
        <ul className="mt-4 flex-1 space-y-2 text-sm text-vice-text">
          {items.length === 0 ?
            <li className="text-vice-text-muted">Nog geen punten — bewerk of laat AI een aanzet maken.</li>
          : items.map((item) => (
              <li key={item.id} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden />
                <span>{item.statement}</span>
              </li>
            ))
          }
        </ul>
        {!readOnly && (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={() => openEdit(q)}>
              <Pencil className="size-3.5" aria-hidden />
              Bewerken
            </Button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" asChild variant="secondary" className="h-8 text-xs">
            <Link href={`/klanten/${tenantId}/strategie/${MARKETING_5C_ROUTE}`}>← Vorige</Link>
          </Button>
          <div className="flex gap-1" aria-label={`Stap ${SWOT_FRAMEWORK_INDEX} van ${AUDIT_FRAMEWORK_COUNT}`}>
            {Array.from({ length: AUDIT_FRAMEWORK_COUNT }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2 rounded-full",
                  i + 1 === SWOT_FRAMEWORK_INDEX ? "bg-vice-gold ring-2 ring-vice-gold/40" : "bg-vice-border",
                )}
              />
            ))}
          </div>
        </div>
        <p className="mt-4 text-sm text-vice-text-muted">
          Klanten / {tenantName} · Interne werkruimte
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
          Stap {SWOT_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · SWOT
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">Waar ligt je voordeel?</h1>
        <p className="mt-2 text-sm text-vice-text-muted">
          Een eerste synthese van je gesprekken en onderzoek (PESTEL, Porter, 5C). Vul handmatig in of laat AI een
          aanzet maken — altijd op basis van bestaande bronnen, zonder webonderzoek.
        </p>
        <p className="mt-1 text-xs text-vice-text-muted">
          Versie {version.version_number} · {SWOT_STATUS_LABELS[version.status]}
          {version.ai_generated_at && ` · AI-aanzet ${formatRelative(version.ai_generated_at)}`}
        </p>
      </header>

      {fiveCStale && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Er is een nieuwere goedgekeurde 5C-analyse. Herlaad de pagina na goedkeuring van die versie om de SWOT te
          koppelen.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {!hasContent && !readOnly && (
        <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-dashed border-vice-border bg-vice-surface p-5">
          <Button
            type="button"
            className="gap-2 bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
            disabled={busy !== null}
            onClick={() => void runAi(false)}
          >
            {busy === "ai" ?
              <Loader2 className="size-4 animate-spin" aria-hidden />
            : <Sparkles className="size-4" aria-hidden />}
            Maak AI-aanzet
          </Button>
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => openEdit("strength")}>
            Zelf invullen
          </Button>
        </div>
      )}

      {hasContent && !readOnly && (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            className="gap-2 border-vice-gold/40"
            disabled={busy !== null}
            onClick={() => void runAi(false)}
          >
            {busy === "ai" ?
              <Loader2 className="size-4 animate-spin" aria-hidden />
            : <Sparkles className="size-4" aria-hidden />}
            Opnieuw met AI
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {renderQuadrantCard("strength")}
        {renderQuadrantCard("weakness")}
        {renderQuadrantCard("opportunity")}
        {renderQuadrantCard("threat")}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-vice-border pt-6">
        <div className="flex flex-wrap items-center gap-4 text-sm text-vice-text-muted">
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4" aria-hidden />
            Gebaseerd op {sourceCount || wb.inputs.meetings.length + wb.inputs.pestel_insights.length} bronnen
          </span>
          {!version.advisor_reviewed && version.status !== "approved" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Concept · jouw beoordeling nodig
            </span>
          )}
          {version.advisor_reviewed && version.status !== "approved" && (
            <span className="text-xs text-emerald-700 dark:text-emerald-300">Klaar om goed te keuren</span>
          )}
        </div>
        {savedAt && !readOnly && (
          <p className="text-xs text-vice-text-muted">Automatisch opgeslagen · {formatRelative(savedAt)}</p>
        )}
      </div>

      <footer className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {readOnly ?
          <p className="mr-auto text-sm text-emerald-700 dark:text-emerald-300">
            SWOT goedgekeurd · volgende stap in de audit volgt binnenkort
          </p>
        : <>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setAdjustOpen(true)}>
              Aanpassing vragen
            </Button>
            <Button
              type="button"
              className="gap-2 bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
              disabled={busy !== null || !hasContent}
              onClick={() => void approve()}
            >
              {busy === "approve" || busy === "review" ?
                <Loader2 className="size-4 animate-spin" aria-hidden />
              : null}
              Goedkeuren en verder →
            </Button>
          </>
        }
      </footer>

      {editQuadrant && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setEditQuadrant(null)}>
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-vice-border bg-vice-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-vice-border px-5 py-4">
              <h2 className="text-lg font-medium">{SWOT_QUADRANT_META[editQuadrant].label}</h2>
              <button type="button" className="rounded-md p-1 hover:bg-vice-surface-muted" onClick={() => setEditQuadrant(null)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <Label>Eén punt per regel</Label>
              <textarea
                className="min-h-[280px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                value={editText}
                disabled={readOnly}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="- Direct contact met de zaakvoerder&#10;- …"
              />
              <p className="text-xs text-vice-text-muted">Wijzigingen worden automatisch opgeslagen.</p>
            </div>
            <div className="border-t border-vice-border px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setEditQuadrant(null)}>
                Sluiten
              </Button>
            </div>
          </aside>
        </div>
      )}

      {adjustOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdjustOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-vice-border bg-vice-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium">Aanpassing vragen</h2>
            <p className="mt-1 text-sm text-vice-text-muted">
              Beschrijf wat anders moet in de SWOT. De AI maakt daarna een nieuwe aanzet (bestaande handmatige punten
              blijven staan).
            </p>
            <textarea
              className="mt-4 min-h-[120px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
                disabled={busy !== null || adjustNote.trim().length < 5}
                onClick={() => void runAi(true)}
              >
                Opslaan en AI opnieuw laten maken
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={async () => {
                  await run("adjust", () =>
                    setSwotAdjustmentNoteAction(tenantId, { versionId: version.id, note: adjustNote }),
                  );
                  setAdjustOpen(false);
                }}
              >
                Alleen notitie bewaren
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
