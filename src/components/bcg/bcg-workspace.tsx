"use client";

import { CheckCircle2, Loader2, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BcgItemPanel, type ItemDraft } from "@/components/bcg/bcg-item-panel";
import { BcgMatrix } from "@/components/bcg/bcg-matrix";
import { Chip, fieldClass, formatDate, goldButtonClass } from "@/components/bcg/bcg-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BCG_BASIS_LABELS,
  BCG_KIND_LABELS,
  BCG_PERIOD_LABELS,
  BCG_STATUS_LABELS,
  type BcgItemKind,
  type BcgMeasureBasis,
  type BcgPeriodKind,
} from "@/lib/bcg/constants";
import { buildBcgCatalog } from "@/lib/bcg/input-catalog";
import { availabilityLabel, formatPercent, formatMultiple, matrixPosition, unresolvedOverlapIds } from "@/lib/bcg/math";
import { readingFor } from "@/lib/bcg/reading";
import type { BcgItem, BcgWorkbench } from "@/lib/bcg/types";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { BCG_FRAMEWORK_INDEX, VRIO_ROUTE } from "@/lib/vrio/constants";
import { VALUE_CHAIN_ROUTE } from "@/lib/value-chain/constants";
import {
  addBcgItemAction,
  addBcgScopeAction,
  approveBcgAction,
  createBcgRevisionAction,
  deleteBcgItemAction,
  generateBcgSynthesisAction,
  loadBcgWorkbenchAction,
  prepareBcgAction,
  publishBcgAction,
  resolveBcgAiAction,
  saveBcgItemAction,
  saveBcgScopeAction,
  saveBcgSynthesisAction,
  saveBcgThresholdsAction,
  setBcgOverlapAction,
  setBcgQualitativeAction,
  setBcgReviewAction,
  splitBcgItemAction,
  unpublishBcgAction,
} from "@/modules/bcg/actions";

type View = "select" | "matrix";

export function BcgWorkspace({ tenantId, tenantName, initial }: { tenantId: string; tenantName: string; initial: BcgWorkbench }) {
  const router = useRouter();
  const [wb, setWb] = useState(initial);
  const [view, setView] = useState<View>(initial.items.some((item) => item.selected) ? "matrix" : "select");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState(false);
  const [spread, setSpread] = useState(false);
  const [synthesis, setSynthesis] = useState(initial.version.synthesis_text);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<BcgItemKind>("service");
  const [scopeName, setScopeName] = useState("");
  const [publishFigures, setPublishFigures] = useState(initial.version.publish_figures);
  const version = wb.version;
  const readOnly = version.status === "approved";
  const catalog = useMemo(() => buildBcgCatalog(wb.inputs), [wb.inputs]);
  const selected = wb.items.filter((item) => item.selected);
  const overlapIds = new Set(unresolvedOverlapIds(selected.map((item) => ({
    id: item.id,
    selected: item.selected,
    parentId: item.parent_item_id,
    overlapKey: item.overlap_key,
    overlapMode: item.overlap_mode,
  }))));
  const readings = new Map(wb.items.map((item) => [item.id, readingFor(item, version)]));
  const placeable = selected.filter((item) => readings.get(item.id)?.placeable);
  const reviewed = selected.filter((item) => item.review_status === "reviewed");
  const markets = new Set(selected.map((item) => item.market_definition.trim()).filter(Boolean));
  const openItem = wb.items.find((item) => item.id === openId) ?? null;

  async function reload(versionId?: string) {
    const loaded = await loadBcgWorkbenchAction(tenantId, versionId ?? version.id);
    if (loaded.ok && loaded.data) {
      setWb(loaded.data);
      setSynthesis(loaded.data.version.synthesis_text);
      setPublishFigures(loaded.data.version.publish_figures);
    }
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Opslaan mislukte");
      return result.ok;
    } finally {
      setBusy(null);
    }
  }

  async function fillWithAi() {
    const ok = await run("ai", () => prepareBcgAction(tenantId, { versionId: version.id }));
    if (!ok) return;
    await reload();
    setNotice("De matrix is ingevuld vanuit bestaande bronnen. Cijfers zonder bron zijn leeg gelaten. Bewerkingen blijven staan.");
    setView("matrix");
  }

  async function addItem() {
    setBusy("add");
    setError(null);
    setNotice(null);
    try {
      const result = await addBcgItemAction(tenantId, { versionId: version.id, title: newTitle, kind: newKind });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewTitle("");
      await reload();
      if (result.data) setOpenId(result.data.itemId);
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(itemId: string) {
    if (!window.confirm("Dit aanbod uit de matrix halen?")) return false;
    const ok = await run("delete", () => deleteBcgItemAction(tenantId, { itemId }));
    if (ok) await reload();
    return ok;
  }

  async function saveScope(partial: Partial<BcgWorkbench["version"]> = {}) {
    const next = { ...version, ...partial };
    if (Object.keys(partial).length > 0) patchVersion(partial);
    await run("scope", () => saveBcgScopeAction(tenantId, {
      versionId: next.id,
      scopeLabel: next.scope_label,
      market: next.market_label,
      geography: next.geography,
      segment: next.segment,
      period: next.period_label,
      periodKind: next.period_kind,
      basis: next.measure_basis,
      currency: next.currency,
      unit: next.unit_label,
    }));
    await reload();
  }

  function patchVersion(partial: Partial<BcgWorkbench["version"]>) {
    setWb((current) => ({ ...current, version: { ...current.version, ...partial } }));
  }

  const points = placeable.flatMap((item) => {
    const reading = readings.get(item.id);
    if (!reading?.placeable || reading.growth == null || reading.relative == null || reading.previewQuadrant == null) return [];
    const pos = matrixPosition(reading.growth, reading.relative, Number(version.growth_threshold), Number(version.share_threshold));
    return [{ id: item.id, name: item.title, quadrant: reading.previewQuadrant, x: pos.x, y: pos.y, provisional: reading.provisional }];
  });

  const unplaced = selected.filter((item) => !readings.get(item.id)?.placeable);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-vice-text-muted">Klanten / {tenantName} / Strategie · {BCG_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · BCG-matrix</p>
          <Button type="button" asChild variant="secondary" className="h-8 text-xs">
            <Link href={`/klanten/${tenantId}/strategie/${VRIO_ROUTE}`}>Terug naar VRIO</Link>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-vice-text md:text-3xl">
            {view === "select" ? "Waar verdient je portfolio aandacht?" : "Je portfolio in perspectief."}
          </h1>
          <Chip tone="gold">{BCG_STATUS_LABELS[version.status]}</Chip>
        </div>
        <p className="mt-2 text-sm text-vice-text-muted">
          {view === "select"
            ? "AI vult de matrix vanuit het dossier. Jij voegt een aanbod toe, verwijdert het, of bewerkt wat al ingevuld is."
            : "Alleen onderbouwde cijfers krijgen een plek. Een kwadrant is geen bedrijfsbesluit."}
        </p>
        <p className="mt-1 text-xs text-vice-text-muted">Versie {version.version_number}{version.ai_generated_at ? ` · AI-voorbereiding ${formatDate(version.ai_generated_at)}` : ""}</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["VRIO", wb.upstream.vrio],
          ["5C", wb.upstream.five_c],
          ["Porter", wb.upstream.porter],
          ["PESTEL", wb.upstream.pestel],
          ["SWOT", wb.upstream.swot],
        ] as const).map(([label, source]) => (
          <span key={label} className="inline-flex items-center gap-1 rounded-full border border-vice-border px-3 py-1 text-xs">
            {source ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : null}
            {label} {source ? `v${source.version_number}` : "ontbreekt"}
          </span>
        ))}
      </div>

      {wb.scopes.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {wb.scopes.map((scope) => (
            <Button key={scope.id} type="button" variant={scope.id === version.id ? "secondary" : "ghost"} className="h-8 text-xs" onClick={() => void reload(scope.id)}>
              {scope.scope_label || `Versie ${scope.version_number}`}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {notice && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm" role="status">{notice}</p>}
      {markets.size > 1 && <p className="mb-4 rounded-lg border border-vice-border px-4 py-3 text-sm">Deze items zitten in verschillende markten. De definities blijven per aanbod zichtbaar en worden niet samengevoegd.</p>}
      {overlapIds.size > 0 && <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">Overlappend aanbod telt nog dubbel. Kies per item wat meetelt.</p>}

      <div className="mb-4 flex gap-2">
        <Button type="button" variant={view === "select" ? "secondary" : "ghost"} onClick={() => setView("select")}>Portfolio</Button>
        <Button type="button" variant={view === "matrix" ? "secondary" : "ghost"} onClick={() => setView("matrix")}>Matrix</Button>
      </div>

      {view === "select" ? (
        <section className="rounded-xl border border-vice-border bg-vice-surface p-5">
          <h2 className="text-sm font-medium">Vul de matrix met AI</h2>
          <p className="mt-2 text-sm text-vice-text-muted">
            AI neemt het aanbod uit de 5C en vult markt, groei en relatief aandeel alleen waar het dossier een bron heeft. Lege velden blijven leeg. Een latere AI-ronde overschrijft geen bewerking.
          </p>
          <Button type="button" className={`mt-4 ${goldButtonClass}`} disabled={readOnly || busy !== null} onClick={() => void fillWithAi()}>
            {busy === "ai" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Vul de BCG-matrix met AI
          </Button>

          <h2 className="mt-8 text-sm font-medium">Ingevuld aanbod</h2>
          {wb.items.length === 0 ? (
            <p className="mt-2 text-sm text-vice-text-muted">Nog leeg. Start de AI, of voeg zelf een aanbod toe.</p>
          ) : (
            <ul className="mt-3 divide-y divide-vice-border">
              {wb.items.map((item) => {
                const reading = readings.get(item.id);
                const label = reading ? availabilityLabel(reading, item.selected) : "Nog aanvullen";
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-vice-text-muted">{BCG_KIND_LABELS[item.kind]}{item.market_definition ? ` · ${item.market_definition}` : ""}</span>
                    </div>
                    <Chip tone={label === "Gegevens beschikbaar" ? "green" : "amber"}>{label}</Chip>
                    <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setOpenId(item.id)}>Bewerken</Button>
                    <Button type="button" variant="ghost" className="h-8 text-xs" disabled={readOnly || busy !== null} onClick={() => void removeItem(item.id)}>Verwijderen</Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Label className="text-xs">Aanbod toevoegen
              <Input className="mt-1" value={newTitle} disabled={readOnly} onChange={(e) => setNewTitle(e.target.value)} placeholder="Naam van product, dienst of eenheid" />
            </Label>
            <select className={fieldClass} value={newKind} disabled={readOnly} onChange={(e) => setNewKind(e.target.value as BcgItemKind)}>
              {Object.entries(BCG_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <Button type="button" variant="secondary" disabled={readOnly || busy !== null || newTitle.trim().length < 2} onClick={() => void addItem()}>
              <Plus className="size-4" /> Toevoegen
            </Button>
          </div>
          <p className="mt-2 text-xs text-vice-text-muted">Een nieuw aanbod blijft open voor de volgende AI-ronde, tot je het zelf bewerkt.</p>

          <h2 className="mt-8 text-sm font-medium">Afbakening bijstellen</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Label className="text-xs">Markt
              <Input className="mt-1" value={version.market_label} disabled={readOnly} onChange={(e) => patchVersion({ market_label: e.target.value })} onBlur={() => void saveScope()} />
            </Label>
            <Label className="text-xs">Periode
              <Input className="mt-1" value={version.period_label} disabled={readOnly} onChange={(e) => patchVersion({ period_label: e.target.value })} onBlur={() => void saveScope()} />
            </Label>
            <Label className="text-xs">Geografie
              <Input className="mt-1" value={version.geography} disabled={readOnly} onChange={(e) => patchVersion({ geography: e.target.value })} onBlur={() => void saveScope()} />
            </Label>
            <Label className="text-xs">Meetbasis
              <select className={`${fieldClass} mt-1`} value={version.measure_basis} disabled={readOnly} onChange={(e) => void saveScope({ measure_basis: e.target.value as BcgMeasureBasis | "" })}>
                <option value="">Kies</option>
                {Object.entries(BCG_BASIS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Label>
            <Label className="text-xs">Soort periode
              <select className={`${fieldClass} mt-1`} value={version.period_kind} disabled={readOnly} onChange={(e) => void saveScope({ period_kind: e.target.value as BcgPeriodKind | "" })}>
                <option value="">Kies</option>
                {Object.entries(BCG_PERIOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Label>
          </div>
          <div className="mt-4 flex gap-2">
            <Input value={scopeName} disabled={readOnly} onChange={(e) => setScopeName(e.target.value)} placeholder="Nieuwe portfolioanalyse" />
            <Button type="button" variant="secondary" disabled={readOnly || busy !== null} onClick={() => void addBcgScopeAction(tenantId, { label: scopeName }).then(async (result) => { if (result.ok && result.data) { setScopeName(""); await reload(result.data.versionId); } else setError(result.ok ? "Geen versie" : result.error); })}>Bewaar aparte scope</Button>
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setAssumptions((open) => !open)}>Aannames bekijken</Button>
              <Button type="button" variant="secondary" disabled={readOnly || busy !== null} onClick={() => void fillWithAi()}>
                {busy === "ai" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Werk bij met AI
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-vice-text-muted">
              <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
              Labels spreiden
            </label>
          </div>
          {assumptions && (
            <Assumptions version={version} readOnly={readOnly} busy={busy !== null} onSave={async (growth, note, source, share, confirm) => {
              const ok = await run("thresholds", () => saveBcgThresholdsAction(tenantId, { versionId: version.id, growth, note, source, share, confirm }));
              if (ok) await reload();
            }} onQualitative={async (on, reason) => {
              const ok = await run("qual", () => setBcgQualitativeAction(tenantId, { versionId: version.id, on, reason }));
              if (ok) await reload();
            }} />
          )}
          {version.qualitative ? (
            <div className="rounded-xl border border-vice-border bg-vice-surface p-6 text-sm">
              <p className="font-medium">Kwalitatieve portfoliobespreking</p>
              <p className="mt-2 text-vice-text-muted">{version.qualitative_reason}</p>
              <p className="mt-2">Dit is geen kwantitatief onderbouwde BCG-matrix.</p>
            </div>
          ) : (
            <BcgMatrix
              points={points}
              spreadLabels={spread}
              growthLabel={version.growth_threshold ? `Groeigrens ${formatPercent(Number(version.growth_threshold))}` : "Groeigrens nog niet vastgelegd"}
              shareLabel={version.share_threshold ? formatMultiple(Number(version.share_threshold)) : "1×"}
              onSelect={setOpenId}
            />
          )}
          <p className="mt-2 text-xs text-vice-text-muted">Puntgrootte heeft geen financiële betekenis.</p>
          {selected.length === 1 && <p className="mt-2 text-xs text-vice-text-muted">Eén aanbod kan een klasse krijgen. Dat is nog geen rijke portfoliovergelijking.</p>}

          <div className="mt-6">
            <h2 className="text-sm font-medium">Nog niet plaatsbaar ({unplaced.length})</h2>
            <ul className="mt-2 space-y-2">
              {unplaced.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-vice-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-vice-text-muted">{readings.get(item.id)?.reasons[0]}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setOpenId(item.id)}>Bewerken</Button>
                    <Button type="button" variant="ghost" className="h-8 text-xs" disabled={readOnly || busy !== null} onClick={() => void removeItem(item.id)}>Verwijderen</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {version.ai_questions.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium">Open vragen</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-vice-text-muted">{version.ai_questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-sm font-medium">Wat betekent dit voor je portfolio?</h2>
            <textarea className={`${fieldClass} mt-2`} rows={5} value={synthesis} disabled={readOnly} onChange={(e) => setSynthesis(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={readOnly || busy !== null || selected.length === 0} onClick={() => void run("synthesis-ai", () => generateBcgSynthesisAction(tenantId, { versionId: version.id })).then(async (ok) => { if (ok) { await reload(); setNotice("AI-synthese staat als concept. Markeer ze als beoordeeld voor je verdergaat."); } })}>
                {busy === "synthesis-ai" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Maak AI-synthese
              </Button>
              <Button type="button" variant="secondary" disabled={readOnly || busy !== null} onClick={() => void run("synthesis", () => saveBcgSynthesisAction(tenantId, { versionId: version.id, text: synthesis, reviewed: false })).then(async (ok) => { if (ok) await reload(); })}>Opslaan als concept</Button>
              <Button type="button" className={goldButtonClass} disabled={readOnly || busy !== null || synthesis.trim().length < 20} onClick={() => void run("synthesis-ok", () => saveBcgSynthesisAction(tenantId, { versionId: version.id, text: synthesis, reviewed: true })).then(async (ok) => { if (ok) await reload(); })}>Markeer als beoordeeld</Button>
            </div>
          </div>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-vice-border pt-4">
            <p className="text-sm text-vice-text-muted">{reviewed.length} van {selected.length} portfolio-items beoordeeld</p>
            <div className="flex flex-wrap gap-2">
              {readOnly ? (
                <>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={publishFigures} onChange={(e) => setPublishFigures(e.target.checked)} />
                    Cijfers vrijgeven
                  </label>
                  <Button type="button" className={goldButtonClass} disabled={busy !== null} onClick={() => void run("publish", () => publishBcgAction(tenantId, { versionId: version.id, publishFigures })).then(async (ok) => { if (ok) { await reload(); setNotice("De gepubliceerde matrix staat op het klantdashboard."); } })}>Publiceren</Button>
                  {version.published_at && <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("unpublish", () => unpublishBcgAction(tenantId, { versionId: version.id })).then(async (ok) => { if (ok) await reload(); })}>Publicatie intrekken</Button>}
                  <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void createBcgRevisionAction(tenantId, { versionId: version.id }).then(async (result) => { if (result.ok && result.data) await reload(result.data.versionId); else setError(result.ok ? "Geen versie" : result.error); })}>Nieuwe conceptversie</Button>
                  <Button type="button" asChild className={goldButtonClass}><Link href={`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`}>Naar de waardeketen</Link></Button>
                </>
              ) : (
                <Button type="button" className={goldButtonClass} disabled={busy !== null || !canApprove(wb, overlapIds)} onClick={() => void run("approve", () => approveBcgAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at })).then((ok) => { if (ok) router.push(`/klanten/${tenantId}/strategie/${VALUE_CHAIN_ROUTE}`); })}>
                  Goedkeuren en verder
                </Button>
              )}
            </div>
          </footer>
        </section>
      )}

      {openItem && (
        <BcgItemPanel
          key={openItem.id}
          tenantId={tenantId}
          item={openItem}
          version={version}
          catalog={catalog}
          readOnly={readOnly}
          busy={busy !== null}
          onClose={() => setOpenId(null)}
          onSave={async (draft) => {
            const ok = await run("item", () => saveBcgItemAction(tenantId, draftPayload(version.id, openItem, draft)));
            if (ok) { await reload(); setOpenId(null); }
          }}
          onReview={async (draft) => {
            const saved = await run("item", () => saveBcgItemAction(tenantId, draftPayload(version.id, openItem, draft)));
            if (!saved) return;
            const ok = await run("review", () => setBcgReviewAction(tenantId, { itemId: openItem.id, reviewed: true, gap: draft.gapReason }));
            if (ok) { await reload(); setOpenId(null); }
          }}
          onDelete={async () => {
            const ok = await removeItem(openItem.id);
            if (ok) setOpenId(null);
          }}
          onSplit={async (titles) => {
            const ok = await run("split", () => splitBcgItemAction(tenantId, { itemId: openItem.id, titles: titles.filter((title) => title.trim().length >= 2) }));
            if (ok) { await reload(); setOpenId(null); }
          }}
          onOverlap={async (mode) => {
            const ok = await run("overlap", () => setBcgOverlapAction(tenantId, { itemId: openItem.id, mode, key: openItem.overlap_key }));
            if (ok) await reload();
          }}
          onResolveAi={async (accept) => {
            const ok = await run("ai-resolve", () => resolveBcgAiAction(tenantId, { itemId: openItem.id, accept }));
            if (ok) await reload();
          }}
        />
      )}
    </div>
  );
}

function canApprove(wb: BcgWorkbench, overlapIds: Set<string>): boolean {
  const version = wb.version;
  const selected = wb.items.filter((item) => item.selected);
  if (!version.synthesis_reviewed || version.synthesis_text.trim().length < 20) return false;
  if (overlapIds.size > 0) return false;
  if (version.qualitative) {
    return version.qualitative_reason.trim().length >= 20 && selected.every((item) => item.review_status === "reviewed");
  }
  if (!version.thresholds_confirmed) return false;
  if (selected.length === 0) return false;
  return selected.every((item) => {
    if (item.review_status !== "reviewed") return false;
    const reading = readingFor(item, version);
    return reading.placeable || item.gap_reason.trim().length >= 10;
  });
}

function draftPayload(versionId: string, item: BcgItem | null, draft: ItemDraft) {
  return {
    versionId,
    itemId: item?.id ?? null,
    expectedUpdatedAt: item?.updated_at ?? null,
    title: draft.title,
    description: draft.description,
    kind: draft.kind,
    marketDefinition: draft.marketDefinition,
    geography: draft.geography,
    segment: draft.segment,
    periodLabel: draft.periodLabel,
    periodKind: draft.periodKind,
    measureBasis: draft.measureBasis,
    currency: draft.currency,
    unitLabel: draft.unitLabel,
    scopeConfirmed: draft.scopeConfirmed,
    growthMethod: draft.growthMethod,
    growthPercent: draft.growthPercent,
    sizePrevious: draft.sizePrevious,
    sizeCurrent: draft.sizeCurrent,
    sizeScale: draft.sizeScale,
    growthEvidence: draft.growthEvidence,
    shareMethod: draft.shareMethod,
    ownShare: draft.ownShare,
    leaderShare: draft.leaderShare,
    ownAmount: draft.ownAmount,
    leaderAmount: draft.leaderAmount,
    amountScale: draft.amountScale,
    clientIsLeader: draft.clientIsLeader,
    leaderName: draft.leaderName,
    shareEvidence: draft.shareEvidence,
    figuresConflict: draft.figuresConflict,
    conflictAccepted: draft.conflictAccepted,
    figuresConfirmed: false,
    advisorNote: draft.advisorNote,
    openQuestion: draft.openQuestion,
    questionStatus: draft.questionStatus,
    gapReason: draft.gapReason,
    refs: draft.refs,
  };
}

function Assumptions({
  version,
  readOnly,
  busy,
  onSave,
  onQualitative,
}: {
  version: BcgWorkbench["version"];
  readOnly: boolean;
  busy: boolean;
  onSave: (growth: string, note: string, source: string, share: string, confirm: boolean) => Promise<void>;
  onQualitative: (on: boolean, reason: string) => Promise<void>;
}) {
  const [growth, setGrowth] = useState(version.growth_threshold ?? "");
  const [note, setNote] = useState(version.growth_threshold_note);
  const [source, setSource] = useState(version.growth_threshold_source);
  const [share, setShare] = useState(version.share_threshold ?? "1");
  const [confirm, setConfirm] = useState(version.thresholds_confirmed);
  const [reason, setReason] = useState(version.qualitative_reason);
  return (
    <div className="mb-4 rounded-xl border border-vice-border bg-vice-surface p-4">
      <p className="text-sm font-medium">Classificatieregels</p>
      <p className="mt-1 text-xs text-vice-text-muted">Groei gelijk aan de grens telt als hoge groei. Relatief marktaandeel gelijk aan de grens telt als hoog aandeel. Een goedgekeurde versie verandert niet mee.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Label className="text-xs">Groeigrens in %
          <Input className="mt-1" value={growth} disabled={readOnly} onChange={(e) => setGrowth(e.target.value)} placeholder="geen verplichte 10%" />
        </Label>
        <Label className="text-xs">Grens relatief marktaandeel
          <Input className="mt-1" value={share} disabled={readOnly} onChange={(e) => setShare(e.target.value)} />
        </Label>
      </div>
      <Label className="mt-3 block text-xs">Motivatie
        <textarea className={`${fieldClass} mt-1`} rows={2} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
      </Label>
      <Label className="mt-3 block text-xs">Bron van de grens
        <Input className="mt-1" value={source} disabled={readOnly} onChange={(e) => setSource(e.target.value)} />
      </Label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirm} disabled={readOnly} onChange={(e) => setConfirm(e.target.checked)} />
        Deze grenzen gelden voor deze versie
      </label>
      <Button type="button" className={`mt-3 ${goldButtonClass}`} disabled={readOnly || busy} onClick={() => void onSave(growth, note, source, share, confirm)}>Grenzen opslaan</Button>
      <div className="mt-4 border-t border-vice-border pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={version.qualitative} disabled={readOnly} onChange={(e) => void onQualitative(e.target.checked, reason)} />
          BCG is hier niet kwantitatief toepasbaar
        </label>
        <textarea className={`${fieldClass} mt-2`} rows={2} value={reason} disabled={readOnly} onChange={(e) => setReason(e.target.value)} placeholder="Waarom ontbreken bruikbare marktgegevens?" />
        <Button type="button" variant="secondary" className="mt-2" disabled={readOnly || busy} onClick={() => void onQualitative(true, reason)}>Reden opslaan</Button>
      </div>
    </div>
  );
}
