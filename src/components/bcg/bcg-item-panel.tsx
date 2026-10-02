"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, RefChip, fieldClass, goldButtonClass } from "@/components/bcg/bcg-ui";
import type { BcgCatalogEntry } from "@/lib/bcg/input-catalog";
import {
  BCG_BASIS_LABELS,
  BCG_EVIDENCE_LABELS,
  BCG_KIND_LABELS,
  BCG_PERIOD_LABELS,
  BCG_QUADRANT_META,
  BCG_SCALE_LABELS,
  type BcgEvidence,
  type BcgItemKind,
  type BcgMeasureBasis,
  type BcgOverlapMode,
  type BcgPeriodKind,
  type BcgScale,
} from "@/lib/bcg/constants";
import { readingFor } from "@/lib/bcg/reading";
import type { BcgItem, BcgRef, BcgVersion } from "@/lib/bcg/types";

export type ItemDraft = {
  title: string;
  description: string;
  kind: BcgItemKind;
  marketDefinition: string;
  geography: string;
  segment: string;
  periodLabel: string;
  periodKind: BcgPeriodKind | "";
  measureBasis: BcgMeasureBasis | "";
  currency: string;
  unitLabel: string;
  scopeConfirmed: boolean;
  growthMethod: BcgItem["growth_method"];
  growthPercent: string;
  sizePrevious: string;
  sizeCurrent: string;
  sizeScale: BcgScale;
  growthEvidence: BcgEvidence | "";
  shareMethod: BcgItem["share_method"];
  ownShare: string;
  leaderShare: string;
  ownAmount: string;
  leaderAmount: string;
  amountScale: BcgScale;
  clientIsLeader: boolean;
  leaderName: string;
  shareEvidence: BcgEvidence | "";
  figuresConflict: string;
  conflictAccepted: boolean;
  advisorNote: string;
  openQuestion: string;
  questionStatus: BcgItem["question_status"];
  gapReason: string;
  refs: BcgRef[];
};

function draftFrom(item: BcgItem): ItemDraft {
  return {
    title: item.title,
    description: item.description,
    kind: item.kind,
    marketDefinition: item.market_definition,
    geography: item.geography,
    segment: item.segment,
    periodLabel: item.period_label,
    periodKind: item.period_kind,
    measureBasis: item.measure_basis,
    currency: item.currency,
    unitLabel: item.unit_label,
    scopeConfirmed: item.scope_confirmed,
    growthMethod: item.growth_method,
    growthPercent: item.growth_percent ?? "",
    sizePrevious: item.size_previous ?? "",
    sizeCurrent: item.size_current ?? "",
    sizeScale: item.size_scale,
    growthEvidence: item.growth_evidence,
    shareMethod: item.share_method,
    ownShare: item.own_share ?? "",
    leaderShare: item.leader_share ?? "",
    ownAmount: item.own_amount ?? "",
    leaderAmount: item.leader_amount ?? "",
    amountScale: item.amount_scale,
    clientIsLeader: item.client_is_leader,
    leaderName: item.leader_name,
    shareEvidence: item.share_evidence,
    figuresConflict: item.figures_conflict,
    conflictAccepted: item.conflict_accepted,
    advisorNote: item.advisor_note,
    openQuestion: item.open_question,
    questionStatus: item.question_status,
    gapReason: item.gap_reason,
    refs: item.refs,
  };
}

export function BcgItemPanel({
  tenantId,
  item,
  version,
  catalog,
  readOnly,
  busy,
  onClose,
  onSave,
  onReview,
  onExclude,
  onSplit,
  onOverlap,
  onResolveAi,
}: {
  tenantId: string;
  item: BcgItem;
  version: BcgVersion;
  catalog: BcgCatalogEntry[];
  readOnly: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
  onReview: (draft: ItemDraft) => Promise<void>;
  onExclude: (reason: string) => Promise<void>;
  onSplit: (titles: string[]) => Promise<void>;
  onOverlap: (mode: BcgOverlapMode) => Promise<void>;
  onResolveAi: (accept: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState<ItemDraft>(() => draftFrom(item));
  const [excludeReason, setExcludeReason] = useState("");
  const [parts, setParts] = useState(["", ""]);
  const [sourceKey, setSourceKey] = useState("");
  const patch = (partial: Partial<ItemDraft>) => setForm((current) => ({ ...current, ...partial }));
  const reading = readingFor(
    {
      ...item,
      title: form.title,
      market_definition: form.marketDefinition,
      geography: form.geography,
      segment: form.segment,
      period_label: form.periodLabel,
      period_kind: form.periodKind,
      measure_basis: form.measureBasis,
      scope_confirmed: form.scopeConfirmed,
      growth_method: form.growthMethod,
      growth_percent: form.growthPercent || null,
      size_previous: form.sizePrevious || null,
      size_current: form.sizeCurrent || null,
      size_scale: form.sizeScale,
      growth_evidence: form.growthEvidence,
      share_method: form.shareMethod,
      own_share: form.ownShare || null,
      leader_share: form.leaderShare || null,
      own_amount: form.ownAmount || null,
      leader_amount: form.leaderAmount || null,
      amount_scale: form.amountScale,
      client_is_leader: form.clientIsLeader,
      leader_name: form.leaderName,
      share_evidence: form.shareEvidence,
      figures_conflict: form.figuresConflict,
      conflict_accepted: form.conflictAccepted,
      gap_reason: form.gapReason,
    },
    version,
  );
  const proposal = item.ai_state === "proposed" ? item.ai_payload : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="presentation" onMouseDown={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-vice-border bg-vice-surface p-5 shadow-xl"
        role="dialog"
        aria-labelledby="bcg-item-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-vice-text-muted">Gegevens voor plaatsing</p>
            <h2 id="bcg-item-title" className="text-lg font-semibold text-vice-text">{form.title || "Aanbod"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-vice-text-muted" aria-label="Sluiten">×</button>
        </div>

        {proposal && (
          <div className="mb-4 rounded-lg border border-vice-gold/40 bg-vice-gold/10 p-3 text-sm">
            <p className="font-medium">Voorstel uit bestaande bronnen</p>
            <p className="mt-1 text-vice-text-muted">{proposal.open_question || proposal.market_definition || "Cijfers die niet in de bronnen staan, zijn weggelaten."}</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" disabled={busy || readOnly} className={goldButtonClass} onClick={() => void onResolveAi(true)}>Voorstel aanvaarden</Button>
              <Button type="button" variant="secondary" disabled={busy || readOnly} onClick={() => void onResolveAi(false)}>Afwijzen</Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Label className="block text-xs">Naam
            <Input className="mt-1" value={form.title} disabled={readOnly} onChange={(e) => patch({ title: e.target.value })} />
          </Label>
          <Label className="block text-xs">Beschrijving
            <textarea className={`${fieldClass} mt-1`} rows={2} value={form.description} disabled={readOnly} onChange={(e) => patch({ description: e.target.value })} />
          </Label>
          <Label className="block text-xs">Type
            <select className={`${fieldClass} mt-1`} value={form.kind} disabled={readOnly} onChange={(e) => patch({ kind: e.target.value as BcgItemKind })}>
              {Object.entries(BCG_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Label>
          <Label className="block text-xs">Marktdefinitie
            <Input className="mt-1" value={form.marketDefinition} disabled={readOnly} onChange={(e) => patch({ marketDefinition: e.target.value })} />
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Label className="block text-xs">Geografie
              <Input className="mt-1" value={form.geography} disabled={readOnly} onChange={(e) => patch({ geography: e.target.value })} />
            </Label>
            <Label className="block text-xs">Klantsegment
              <Input className="mt-1" value={form.segment} disabled={readOnly} onChange={(e) => patch({ segment: e.target.value })} />
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Label className="block text-xs">Meetperiode
              <Input className="mt-1" value={form.periodLabel} disabled={readOnly} onChange={(e) => patch({ periodLabel: e.target.value })} />
            </Label>
            <Label className="block text-xs">Soort periode
              <select className={`${fieldClass} mt-1`} value={form.periodKind} disabled={readOnly} onChange={(e) => patch({ periodKind: e.target.value as BcgPeriodKind | "" })}>
                <option value="">Kies</option>
                {Object.entries(BCG_PERIOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Label>
          </div>
          <Label className="block text-xs">Meetbasis
            <select className={`${fieldClass} mt-1`} value={form.measureBasis} disabled={readOnly} onChange={(e) => patch({ measureBasis: e.target.value as BcgMeasureBasis | "" })}>
              <option value="">Kies</option>
              {Object.entries(BCG_BASIS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.scopeConfirmed} disabled={readOnly} onChange={(e) => patch({ scopeConfirmed: e.target.checked })} />
            Afbakening bevestigd
          </label>

          <div className="rounded-lg border border-vice-border p-3">
            <p className="text-sm font-medium">Marktgroei</p>
            <select className={`${fieldClass} mt-2`} value={form.growthMethod} disabled={readOnly} onChange={(e) => patch({ growthMethod: e.target.value as ItemDraft["growthMethod"] })}>
              <option value="none">Nog niet ingevuld</option>
              <option value="direct">Rechtstreeks percentage</option>
              <option value="from_size">Berekend uit marktomvang</option>
            </select>
            {form.growthMethod === "direct" && (
              <Label className="mt-2 block text-xs">Groei in %
                <Input className="mt-1" value={form.growthPercent} disabled={readOnly} onChange={(e) => patch({ growthPercent: e.target.value })} placeholder="leeg = onbekend" />
              </Label>
            )}
            {form.growthMethod === "from_size" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Label className="text-xs">Vorige omvang
                  <Input className="mt-1" value={form.sizePrevious} disabled={readOnly} onChange={(e) => patch({ sizePrevious: e.target.value })} />
                </Label>
                <Label className="text-xs">Huidige omvang
                  <Input className="mt-1" value={form.sizeCurrent} disabled={readOnly} onChange={(e) => patch({ sizeCurrent: e.target.value })} />
                </Label>
              </div>
            )}
            <Label className="mt-2 block text-xs">Schaal
              <select className={`${fieldClass} mt-1`} value={form.sizeScale} disabled={readOnly} onChange={(e) => patch({ sizeScale: e.target.value as BcgScale })}>
                {Object.entries(BCG_SCALE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Label>
            <p className="mt-1 text-[11px] text-vice-text-muted">Geen duizendtalpunten. Een punt is een decimaal. Leeg is onbekend, niet nul.</p>
            {reading.growthFormula && <p className="mt-2 text-xs text-vice-text">{reading.growthFormula}</p>}
            <EvidenceSelect value={form.growthEvidence} disabled={readOnly} onChange={(growthEvidence) => patch({ growthEvidence })} />
          </div>

          <div className="rounded-lg border border-vice-border p-3">
            <p className="text-sm font-medium">Relatief marktaandeel</p>
            <p className="mt-1 text-[11px] text-vice-text-muted">Eigen aandeel gedeeld door het aandeel van de grootste andere concurrent wanneer de klant marktleider is.</p>
            <select className={`${fieldClass} mt-2`} value={form.shareMethod} disabled={readOnly} onChange={(e) => patch({ shareMethod: e.target.value as ItemDraft["shareMethod"] })}>
              <option value="none">Nog niet ingevuld</option>
              <option value="from_shares">Uit marktaandelen</option>
              <option value="from_amounts">Uit omzet of volume in dezelfde markt</option>
            </select>
            {form.shareMethod === "from_shares" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Label className="text-xs">Eigen aandeel %
                  <Input className="mt-1" value={form.ownShare} disabled={readOnly} onChange={(e) => patch({ ownShare: e.target.value })} />
                </Label>
                <Label className="text-xs">Grootste concurrent %
                  <Input className="mt-1" value={form.leaderShare} disabled={readOnly} onChange={(e) => patch({ leaderShare: e.target.value })} />
                </Label>
              </div>
            )}
            {form.shareMethod === "from_amounts" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Label className="text-xs">Eigen omzet of volume
                  <Input className="mt-1" value={form.ownAmount} disabled={readOnly} onChange={(e) => patch({ ownAmount: e.target.value })} />
                </Label>
                <Label className="text-xs">Grootste concurrent
                  <Input className="mt-1" value={form.leaderAmount} disabled={readOnly} onChange={(e) => patch({ leaderAmount: e.target.value })} />
                </Label>
              </div>
            )}
            <Label className="mt-2 block text-xs">Naam grootste concurrent
              <Input className="mt-1" value={form.leaderName} disabled={readOnly} onChange={(e) => patch({ leaderName: e.target.value })} />
            </Label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.clientIsLeader} disabled={readOnly} onChange={(e) => patch({ clientIsLeader: e.target.checked })} />
              De klant is marktleider; vergelijken met de grootste andere
            </label>
            {reading.relativeFormula && <p className="mt-2 text-xs">{reading.relativeFormula}</p>}
            <EvidenceSelect value={form.shareEvidence} disabled={readOnly} onChange={(shareEvidence) => patch({ shareEvidence })} />
          </div>

          {reading.reasons.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Nog niet plaatsbaar</p>
              <ul className="mt-1 list-disc pl-4">{reading.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
          )}
          <div className="rounded-lg bg-vice-surface-muted p-3 text-sm">
            <p className="font-medium">Waarom deze classificatie?</p>
            <p className="mt-1 text-vice-text-muted">{reading.explanation}</p>
            {reading.previewQuadrant && <Chip tone={reading.placeable ? "green" : "amber"}>{BCG_QUADRANT_META[reading.previewQuadrant].label}{reading.provisional ? " · voorlopig" : ""}</Chip>}
          </div>

          <Label className="block text-xs">Bron koppelen
            <select className={`${fieldClass} mt-1`} value={sourceKey} disabled={readOnly} onChange={(e) => {
              const entry = catalog.find((row) => row.key === e.target.value);
              setSourceKey("");
              if (!entry) return;
              patch({ refs: [...form.refs, { ref_type: entry.ref_type, ref_id: entry.ref_id, label: entry.label, excerpt: entry.text.slice(0, 500), slot: "general" }] });
            }}>
              <option value="">Kies een bron</option>
              {catalog.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </Label>
          <div className="flex flex-wrap gap-1">
            {form.refs.map((ref, index) => (
              <RefChip key={`${ref.ref_type}-${ref.ref_id}-${index}`} tenantId={tenantId} refType={ref.ref_type} refId={ref.ref_id} label={ref.label} onRemove={readOnly ? undefined : () => patch({ refs: form.refs.filter((_, i) => i !== index) })} />
            ))}
          </div>
          <Label className="block text-xs">Eigen toelichting
            <textarea className={`${fieldClass} mt-1`} rows={3} value={form.advisorNote} disabled={readOnly} onChange={(e) => patch({ advisorNote: e.target.value })} />
          </Label>
          <Label className="block text-xs">Open vraag
            <textarea className={`${fieldClass} mt-1`} rows={2} value={form.openQuestion} disabled={readOnly} onChange={(e) => patch({ openQuestion: e.target.value })} />
          </Label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.questionStatus === "queued_meeting"} disabled={readOnly} onChange={(e) => patch({ questionStatus: e.target.checked ? "queued_meeting" : "open" })} />
            Vraag bewaren voor een volgende meeting
          </label>
          <Label className="block text-xs">Reden als plaatsing niet kan
            <textarea className={`${fieldClass} mt-1`} rows={2} value={form.gapReason} disabled={readOnly} onChange={(e) => patch({ gapReason: e.target.value })} />
          </Label>
          {form.figuresConflict && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.conflictAccepted} disabled={readOnly} onChange={(e) => patch({ conflictAccepted: e.target.checked })} />
              <span>Conflict beoordeeld: {form.figuresConflict}</span>
            </label>
          )}

          <div className="rounded-lg border border-vice-border p-3">
            <p className="text-sm font-medium">Te brede groep splitsen</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {parts.map((part, index) => (
                <Input key={index} value={part} disabled={readOnly} onChange={(e) => setParts(parts.map((value, i) => i === index ? e.target.value : value))} placeholder={`Deel ${index + 1}`} />
              ))}
            </div>
            <Button type="button" variant="secondary" className="mt-2" disabled={readOnly || busy} onClick={() => void onSplit(parts)}>Opsplitsen</Button>
          </div>
          <Label className="block text-xs">Overlap
            <select className={`${fieldClass} mt-1`} value={item.overlap_mode} disabled={readOnly} onChange={(e) => void onOverlap(e.target.value as BcgOverlapMode)}>
              <option value="unset">Nog geen keuze</option>
              <option value="count">Dit item telt mee</option>
              <option value="excluded">Niet meetellen</option>
            </select>
          </Label>
          <Label className="block text-xs">Uitsluiten
            <Input className="mt-1" value={excludeReason} disabled={readOnly} onChange={(e) => setExcludeReason(e.target.value)} placeholder="Reden" />
          </Label>
          <Button type="button" variant="secondary" disabled={readOnly || busy} onClick={() => void onExclude(excludeReason)}>Gemotiveerd uitsluiten</Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="button" className={goldButtonClass} disabled={readOnly || busy} onClick={() => void onSave(form)}>Opslaan als concept</Button>
          <Button type="button" variant="secondary" disabled={readOnly || busy} onClick={() => void onReview(form)}>Markeren als beoordeeld</Button>
        </div>
      </div>
    </div>
  );
}

function EvidenceSelect({ value, disabled, onChange }: { value: BcgEvidence | ""; disabled: boolean; onChange: (value: BcgEvidence | "") => void }) {
  return (
    <Label className="mt-2 block text-xs">Bewijsstatus
      <select className={`${fieldClass} mt-1`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as BcgEvidence | "")}>
        <option value="">Niet vastgelegd</option>
        {Object.entries(BCG_EVIDENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </Label>
  );
}
