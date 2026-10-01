"use client";

import { AlertTriangle, Check, Loader2, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Chip,
  FIVE_C_ICONS,
  RefChip,
  formatDate,
  goldButtonClass,
  selectClass,
  textareaClass,
} from "@/components/marketing-5c/five-c-ui";
import {
  FIVE_C_CONTENT_TYPE_LABELS,
  FIVE_C_EVIDENCE_LABELS,
  FIVE_C_GAP_STATUS_LABELS,
  FIVE_C_META,
  FIVE_C_QUALIFIERS,
  type FiveCContentType,
  type FiveCEvidenceLevel,
  type FiveCKey,
} from "@/lib/marketing-5c/constants";
import {
  catalogKey,
  entriesForC,
  type FiveCCatalogEntry,
} from "@/lib/marketing-5c/input-catalog";
import type { FiveCItem, FiveCWorkbench } from "@/lib/marketing-5c/types";
import {
  addFiveCUpstreamRequestAction,
  saveFiveCItemAction,
  setFiveCItemReviewAction,
  setFiveCSectionReviewAction,
  updateFiveCGapAction,
} from "@/modules/marketing-5c/actions";
import { cn } from "@/lib/utils";

type RunFn = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

type Draft = {
  itemId: string | null;
  title: string;
  finding: string;
  clientRelevance: string;
  contentType: FiveCContentType;
  evidenceLevel: FiveCEvidenceLevel;
  qualifier: string;
  advisorNote: string;
  openQuestion: string;
  gapReason: string;
  refKeys: string[];
};

function emptyDraft(): Draft {
  return {
    itemId: null,
    title: "",
    finding: "",
    clientRelevance: "",
    contentType: "adopted",
    evidenceLevel: "provided",
    qualifier: "",
    advisorNote: "",
    openQuestion: "",
    gapReason: "",
    refKeys: [],
  };
}

function draftFromItem(item: FiveCItem): Draft {
  return {
    itemId: item.id,
    title: item.title,
    finding: item.finding,
    clientRelevance: item.client_relevance,
    contentType: item.content_type,
    evidenceLevel: item.evidence_level,
    qualifier: item.qualifier,
    advisorNote: item.advisor_note,
    openQuestion: item.open_question,
    gapReason: item.gap_reason,
    refKeys: item.refs.map((r) => catalogKey(r.ref_type, r.ref_id)),
  };
}

const CONTRIBUTION_LABELS: Partial<Record<FiveCKey, { finding: string; relevance: string }>> = {
  collaborators: { finding: "Bijdrage", relevance: "Afhankelijkheid of risico" },
  customers: { finding: "Wat weten we?", relevance: "Betekenis voor het aanbod" },
  competitors: { finding: "Concurrentiebeeld", relevance: "Onderscheid of risico" },
};

export function FiveCSectionPanel({
  tenantId,
  wb,
  cKey,
  catalog,
  readOnly,
  busy,
  run,
  startWithNewItem,
  onClose,
  onAiRefresh,
}: {
  tenantId: string;
  wb: FiveCWorkbench;
  cKey: FiveCKey;
  catalog: FiveCCatalogEntry[];
  readOnly: boolean;
  busy: string | null;
  run: RunFn;
  startWithNewItem: boolean;
  onClose: () => void;
  onAiRefresh: (cKey: FiveCKey) => void;
}) {
  const meta = FIVE_C_META[cKey];
  const Icon = FIVE_C_ICONS[cKey];
  const section = wb.sections.find((s) => s.c_key === cKey);
  const items = wb.items.filter((i) => i.c_key === cKey);
  const visible = items.filter((i) => i.review_status !== "rejected");
  const rejected = items.filter((i) => i.review_status === "rejected");
  const allowedEntries = useMemo(() => entriesForC(catalog, cKey), [catalog, cKey]);
  const qualifiers = FIVE_C_QUALIFIERS[cKey];
  const labels = CONTRIBUTION_LABELS[cKey] ?? { finding: "Bevinding", relevance: "Betekenis" };

  const [draft, setDraft] = useState<Draft | null>(startWithNewItem ? emptyDraft() : null);
  const [gapAnswers, setGapAnswers] = useState<Record<string, string>>({});
  const [gapsAccepted, setGapsAccepted] = useState(section?.gaps_accepted ?? false);
  const [gapsNote, setGapsNote] = useState(section?.gaps_note ?? "");
  const [summary, setSummary] = useState(section?.summary ?? "");
  const [upstreamNote, setUpstreamNote] = useState("");

  const openGaps = visible.filter(
    (i) => i.content_type === "input_needed" && (i.gap_status === "open" || i.gap_status === "queued_meeting"),
  );
  const pendingItems = visible.filter((i) => i.review_status === "pending");
  const openContradictions = wb.contradictions.filter(
    (c) => c.resolution === "open" && c.affected_keys.includes(cKey),
  );
  const upstreamTarget = cKey === "context" ? "pestel" : cKey === "competitors" ? "porter" : null;

  async function saveDraft(markReviewed: boolean) {
    if (!draft) return;
    const ok = await run("item", () =>
      saveFiveCItemAction(tenantId, {
        versionId: wb.version.id,
        cKey,
        ...draft,
        markReviewed,
      }),
    );
    if (ok) setDraft(null);
  }

  function toggleRef(key: string) {
    setDraft((d) =>
      d ?
        {
          ...d,
          refKeys: d.refKeys.includes(key) ? d.refKeys.filter((k) => k !== key) : [...d.refKeys, key],
        }
      : d,
    );
  }

  function renderItem(item: FiveCItem) {
    const isGap = item.content_type === "input_needed";
    const answer = gapAnswers[item.id] ?? item.gap_answer;
    return (
      <li
        key={item.id}
        className={cn(
          "rounded-xl border p-4",
          item.unsupported ? "border-amber-500/50 bg-amber-500/5" : "border-vice-border bg-vice-bg/40",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={item.content_type === "adopted" ? "green" : item.content_type === "derived" ? "violet" : "amber"}>
            {FIVE_C_CONTENT_TYPE_LABELS[item.content_type]}
          </Chip>
          {qualifiers && item.qualifier && qualifiers[item.qualifier] && <Chip>{qualifiers[item.qualifier]}</Chip>}
          <Chip>{FIVE_C_EVIDENCE_LABELS[item.evidence_level]}</Chip>
          <Chip tone={item.origin === "manual" ? "gold" : "neutral"}>
            {item.origin === "manual" ? `Eigen input · ${formatDate(item.created_at)}` : "AI-concept"}
          </Chip>
          {item.review_status === "reviewed" && <Chip tone="green">Beoordeeld</Chip>}
          {isGap && <Chip tone="amber">{FIVE_C_GAP_STATUS_LABELS[item.gap_status]}</Chip>}
        </div>
        <p className="mt-2 font-medium text-vice-text">{item.title}</p>
        {item.finding && <p className="mt-1 whitespace-pre-line text-sm text-vice-text">{item.finding}</p>}
        {item.client_relevance && (
          <p className="mt-1 text-sm text-vice-text-muted">
            <span className="font-medium">{labels.relevance}: </span>
            {item.client_relevance}
          </p>
        )}
        {item.advisor_note && (
          <p className="mt-1 text-sm text-vice-text-muted">
            <span className="font-medium">Eigen aanvulling: </span>
            {item.advisor_note}
          </p>
        )}
        {item.unsupported && (
          <p className="mt-2 flex gap-1.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Niet (voldoende) onderbouwd: {item.unsupported_reason || "controleer de bron"}
          </p>
        )}
        {item.refs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.refs.map((r, idx) => (
              <RefChip key={idx} tenantId={tenantId} refType={r.ref_type} refId={r.ref_id} label={r.label} />
            ))}
          </div>
        )}

        {isGap && (
          <div className="mt-3 space-y-2 rounded-lg bg-amber-500/5 p-3">
            <p className="text-sm">
              <span className="font-medium">Wat ontbreekt? </span>
              {item.open_question}
            </p>
            {item.gap_reason && <p className="text-xs text-vice-text-muted">Waarom nodig: {item.gap_reason}</p>}
            {!readOnly && (
              <>
                <textarea
                  className={cn(textareaClass, "min-h-[56px]")}
                  placeholder="Antwoord of toelichting (intern, niet naar de klant)"
                  value={answer}
                  onChange={(e) => setGapAnswers((g) => ({ ...g, [item.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-7 text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("gap", () =>
                        updateFiveCGapAction(tenantId, { itemId: item.id, gapStatus: "answered", gapAnswer: answer }),
                      )
                    }
                  >
                    Beantwoorden
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-7 text-xs"
                    disabled={busy !== null}
                    onClick={() => setDraft({ ...draftFromItem(item) })}
                  >
                    Bron koppelen
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-7 text-xs"
                    disabled={busy !== null || item.gap_status === "queued_meeting"}
                    onClick={() =>
                      void run("gap", () =>
                        updateFiveCGapAction(tenantId, { itemId: item.id, gapStatus: "queued_meeting", gapAnswer: answer }),
                      )
                    }
                  >
                    Vraag opnemen voor volgende meeting
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-7 text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("gap", () =>
                        updateFiveCGapAction(tenantId, { itemId: item.id, gapStatus: "accepted_open", gapAnswer: answer }),
                      )
                    }
                  >
                    Bewust open laten
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="secondary"
              className="h-7 text-xs"
              disabled={busy !== null}
              onClick={() => setDraft(draftFromItem(item))}
            >
              Bewerken
            </Button>
            {item.review_status !== "reviewed" && (
              <Button
                type="button"
                variant="secondary"
                className="h-7 gap-1 text-xs"
                disabled={busy !== null}
                onClick={() =>
                  void run("review", () =>
                    setFiveCItemReviewAction(tenantId, { itemId: item.id, status: "reviewed", reason: "" }),
                  )
                }
              >
                <Check className="size-3.5" aria-hidden /> Akkoord
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="h-7 text-xs text-red-700 dark:text-red-300"
              disabled={busy !== null}
              onClick={() => {
                const reason = window.prompt("Waarom verwerp je dit inzicht? (optioneel)") ?? null;
                if (reason === null) return;
                void run("review", () =>
                  setFiveCItemReviewAction(tenantId, { itemId: item.id, status: "rejected", reason }),
                );
              }}
            >
              Verwerpen
            </Button>
          </div>
        )}
      </li>
    );
  }

  const groups: { title: string; group: FiveCCatalogEntry["group"] }[] = [
    { title: "Klantdossier", group: "dossier" },
    { title: "PESTEL", group: "pestel" },
    { title: "Porter", group: "porter" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-vice-border bg-vice-surface shadow-xl"
        role="dialog"
        aria-label={meta.label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-vice-border px-5 py-4">
          <div className="flex gap-3">
            <span className="mt-0.5 rounded-lg bg-vice-gold/15 p-2 text-vice-gold">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-medium">
                {meta.label} <span className="text-sm font-normal text-vice-text-muted">· {meta.english}</span>
              </h2>
              <p className="text-sm text-vice-text-muted">{meta.question}</p>
              <p className="mt-1 text-xs text-vice-text-muted">Herkomst: {meta.originLabel}</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-1 hover:bg-vice-surface-muted" onClick={onClose} aria-label="Sluiten">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {section?.needs_revision && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Nieuwe input of gewijzigde bronnen: dit onderdeel moet opnieuw beoordeeld worden.
            </p>
          )}

          {draft ?
            <div className="space-y-3 rounded-xl border border-vice-gold/40 bg-vice-gold/5 p-4">
              <p className="text-sm font-medium">{draft.itemId ? "Inzicht bewerken" : "Zelf een inzicht toevoegen"}</p>
              <div className="space-y-1">
                <Label>Titel</Label>
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{labels.finding}</Label>
                <textarea
                  className={cn(textareaClass, "min-h-[72px]")}
                  value={draft.finding}
                  onChange={(e) => setDraft({ ...draft, finding: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{labels.relevance}</Label>
                <textarea
                  className={cn(textareaClass, "min-h-[56px]")}
                  value={draft.clientRelevance}
                  onChange={(e) => setDraft({ ...draft, clientRelevance: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Inhoudstype</Label>
                  <select
                    className={selectClass}
                    value={draft.contentType}
                    onChange={(e) => setDraft({ ...draft, contentType: e.target.value as FiveCContentType })}
                  >
                    {(Object.keys(FIVE_C_CONTENT_TYPE_LABELS) as FiveCContentType[]).map((k) => (
                      <option key={k} value={k}>
                        {FIVE_C_CONTENT_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Onderbouwing</Label>
                  <select
                    className={selectClass}
                    value={draft.evidenceLevel}
                    onChange={(e) => setDraft({ ...draft, evidenceLevel: e.target.value as FiveCEvidenceLevel })}
                  >
                    {(Object.keys(FIVE_C_EVIDENCE_LABELS) as FiveCEvidenceLevel[]).map((k) => (
                      <option key={k} value={k}>
                        {FIVE_C_EVIDENCE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                {qualifiers && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Classificatie</Label>
                    <select
                      className={selectClass}
                      value={draft.qualifier}
                      onChange={(e) => setDraft({ ...draft, qualifier: e.target.value })}
                    >
                      <option value="">— kies —</option>
                      {Object.entries(qualifiers).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {draft.contentType === "input_needed" && (
                <>
                  <div className="space-y-1">
                    <Label>Open vraag</Label>
                    <Input
                      value={draft.openQuestion}
                      onChange={(e) => setDraft({ ...draft, openQuestion: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Waarom is dit nodig?</Label>
                    <Input value={draft.gapReason} onChange={(e) => setDraft({ ...draft, gapReason: e.target.value })} />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label>Bronnen (herkomst)</Label>
                {allowedEntries.length === 0 ?
                  <p className="text-xs text-vice-text-muted">Geen toegestane bronnen voor dit onderdeel.</p>
                : <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-vice-border bg-vice-bg p-2">
                    {groups.map(({ title, group }) => {
                      const list = allowedEntries.filter((e) => e.group === group && e.ref_id !== draft.itemId);
                      if (list.length === 0) return null;
                      return (
                        <div key={group}>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-vice-text-muted">{title}</p>
                          {list.map((e) => (
                            <label key={e.key} className="flex cursor-pointer items-start gap-2 py-0.5 text-xs">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={draft.refKeys.includes(e.key)}
                                onChange={() => toggleRef(e.key)}
                              />
                              <span>
                                {e.label}
                                {e.date && <span className="text-vice-text-muted"> · {formatDate(e.date)}</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                }
                {draft.contentType !== "input_needed" && draft.refKeys.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-200">
                    Zonder bron wordt dit als eigen aanvulling van de adviseur bewaard.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Eigen aanvulling</Label>
                <textarea
                  className={cn(textareaClass, "min-h-[56px]")}
                  value={draft.advisorNote}
                  onChange={(e) => setDraft({ ...draft, advisorNote: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void saveDraft(false)}>
                  Opslaan als concept
                </Button>
                <Button type="button" className={goldButtonClass} disabled={busy !== null} onClick={() => void saveDraft(true)}>
                  Markeer als beoordeeld
                </Button>
                <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setDraft(null)}>
                  Annuleren
                </Button>
              </div>
            </div>
          : <>
              {visible.length === 0 ?
                <div className="rounded-xl border border-dashed border-vice-border p-4 text-sm">
                  <p className="font-medium">Nog onvoldoende informatie</p>
                  <p className="mt-1 text-vice-text-muted">{meta.emptyNextStep}</p>
                </div>
              : <ul className="space-y-3">
                  {visible.map(renderItem)}
                </ul>
              }
              {rejected.length > 0 && (
                <details className="text-xs text-vice-text-muted">
                  <summary className="cursor-pointer">{rejected.length} verworpen inzicht(en)</summary>
                  <ul className="mt-2 space-y-1">
                    {rejected.map((r) => (
                      <li key={r.id}>
                        <span className="line-through">{r.title}</span>
                        {r.reject_reason && ` — ${r.reject_reason}`}
                        {!readOnly && (
                          <button
                            type="button"
                            className="ml-2 underline hover:text-vice-gold"
                            onClick={() =>
                              void run("review", () =>
                                setFiveCItemReviewAction(tenantId, { itemId: r.id, status: "pending", reason: "" }),
                              )
                            }
                          >
                            Herstellen
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" className="gap-1" disabled={busy !== null} onClick={() => setDraft(emptyDraft())}>
                    <Plus className="size-4" aria-hidden /> Zelf een inzicht toevoegen
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-1 border-vice-gold/40"
                    disabled={busy !== null}
                    onClick={() => onAiRefresh(cKey)}
                  >
                    {busy === `ai-${cKey}` ?
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    : <Sparkles className="size-4" aria-hidden />}
                    Bijwerken met AI
                  </Button>
                </div>
              )}
            </>
          }

          {cKey === "competitors" && (
            <p className="text-xs text-vice-text-muted">
              Concurrenten komen uit Porter.{" "}
              <Link href={`/klanten/${tenantId}/strategie/porter`} className="underline hover:text-vice-gold">
                Open Porter
              </Link>{" "}
              om de bron zelf te bekijken.
            </p>
          )}

          {upstreamTarget && !readOnly && !draft && (
            <div className="space-y-2 rounded-xl border border-dashed border-vice-border p-3">
              <p className="text-sm font-medium">
                {upstreamTarget === "porter" ? "Wijzigingsvoorstel voor Porter" : "Vraag vastleggen voor PESTEL"}
              </p>
              <p className="text-xs text-vice-text-muted">
                {upstreamTarget === "porter" ?
                  "Klopt er iets niet in Porter? Leg het voorstel vast; Porter zelf wordt niet aangepast."
                : "Ontbreekt er een externe ontwikkeling? Leg de vraag vast voor een volgende PESTEL-versie."}
              </p>
              <textarea
                className={cn(textareaClass, "min-h-[56px]")}
                value={upstreamNote}
                onChange={(e) => setUpstreamNote(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                className="h-8 text-xs"
                disabled={busy !== null || upstreamNote.trim().length < 5}
                onClick={async () => {
                  const ok = await run("upstream", () =>
                    addFiveCUpstreamRequestAction(tenantId, {
                      versionId: wb.version.id,
                      target: upstreamTarget,
                      cKey,
                      note: upstreamNote,
                    }),
                  );
                  if (ok) setUpstreamNote("");
                }}
              >
                Vastleggen
              </Button>
              {wb.upstreamRequests
                .filter((r) => r.c_key === cKey)
                .map((r) => (
                  <p key={r.id} className="text-xs text-vice-text-muted">
                    · {r.note} <span className="opacity-70">({formatDate(r.created_at)})</span>
                  </p>
                ))}
            </div>
          )}

          {section && !draft && (
            <div className="space-y-3 rounded-xl border border-vice-border p-4">
              <p className="text-sm font-medium">Beoordeling van dit onderdeel</p>
              <div className="space-y-1">
                <Label>Samenvatting op de kaart</Label>
                <textarea
                  className={cn(textareaClass, "min-h-[56px]")}
                  disabled={readOnly}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
              {pendingItems.length > 0 && (
                <p className="text-xs text-vice-text-muted">
                  Nog {pendingItems.length} inzicht(en) zonder akkoord of verwerping.
                </p>
              )}
              {openContradictions.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-200">
                  {openContradictions.length} open tegenstrijdigheid/-heden raken dit onderdeel.
                </p>
              )}
              {openGaps.length > 0 && (
                <div className="space-y-2 rounded-lg bg-amber-500/5 p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={readOnly}
                      checked={gapsAccepted}
                      onChange={(e) => setGapsAccepted(e.target.checked)}
                    />
                    Ik aanvaard dat {openGaps.length} hiaat/hiaten open blijven
                  </label>
                  <textarea
                    className={cn(textareaClass, "min-h-[48px]")}
                    disabled={readOnly}
                    placeholder="Waarom is dit aanvaardbaar voor de SWOT?"
                    value={gapsNote}
                    onChange={(e) => setGapsNote(e.target.value)}
                  />
                </div>
              )}
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {section.review_status === "reviewed" && !section.needs_revision ?
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("section", () =>
                          setFiveCSectionReviewAction(tenantId, {
                            sectionId: section.id,
                            reviewed: false,
                            gapsAccepted,
                            gapsNote,
                            summary,
                          }),
                        )
                      }
                    >
                      Beoordeling intrekken
                    </Button>
                  : <Button
                      type="button"
                      className={goldButtonClass}
                      disabled={busy !== null}
                      onClick={() =>
                        void run("section", () =>
                          setFiveCSectionReviewAction(tenantId, {
                            sectionId: section.id,
                            reviewed: true,
                            gapsAccepted,
                            gapsNote,
                            summary,
                          }),
                        )
                      }
                    >
                      Onderdeel markeren als beoordeeld
                    </Button>
                  }
                </div>
              )}
              {section.reviewed_at && section.review_status === "reviewed" && (
                <p className="text-xs text-vice-text-muted">Beoordeeld op {formatDate(section.reviewed_at)}</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
