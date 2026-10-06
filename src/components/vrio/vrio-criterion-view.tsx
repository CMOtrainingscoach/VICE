"use client";

import { AlertTriangle, ChevronLeft, Loader2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Chip, RefChip, goldButtonClass, textareaClass } from "@/components/vrio/vrio-ui";
import {
  VRIO_ANSWER_LABELS,
  VRIO_CRITERIA,
  VRIO_CRITERION_META,
  VRIO_EVIDENCE_LABELS,
  type VrioAnswer,
  type VrioCriterion,
  type VrioEvidenceLevel,
} from "@/lib/vrio/constants";
import { catalogKey, VRIO_CRITERION_SOURCES, type VrioCatalogEntry } from "@/lib/vrio/input-catalog";
import type { VrioResource, VrioWorkbench } from "@/lib/vrio/types";
import {
  resolveVrioAiProposalAction,
  saveVrioAssessmentAction,
  updateVrioQuestionAction,
} from "@/modules/vrio/actions";
import { cn } from "@/lib/utils";

type RunFn = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

const ANSWER_OPTIONS: VrioAnswer[] = ["yes", "no", "unknown"];

export function VrioCriterionView({
  tenantId,
  wb,
  resource,
  criterion,
  catalog,
  readOnly,
  busy,
  run,
  onNavigate,
  onBack,
}: {
  tenantId: string;
  wb: VrioWorkbench;
  resource: VrioResource;
  criterion: VrioCriterion;
  catalog: VrioCatalogEntry[];
  readOnly: boolean;
  busy: string | null;
  run: RunFn;
  onNavigate: (criterion: VrioCriterion | null) => void;
  onBack: () => void;
}) {
  const meta = VRIO_CRITERION_META[criterion];
  const assessment = resource.assessments.find((a) => a.criterion === criterion);
  const index = VRIO_CRITERIA.indexOf(criterion);

  const [answer, setAnswer] = useState<VrioAnswer>(assessment?.answer ?? "not_assessed");
  const [motivation, setMotivation] = useState(assessment?.motivation ?? "");
  const [evidenceLevel, setEvidenceLevel] = useState<VrioEvidenceLevel>(
    assessment?.evidence_level ?? "hypothesis",
  );
  const [advisorNote, setAdvisorNote] = useState(assessment?.advisor_note ?? "");
  const [openQuestion, setOpenQuestion] = useState(assessment?.open_question ?? "");
  const [skippedReason, setSkippedReason] = useState(assessment?.skipped_reason ?? "");
  const [refKeys, setRefKeys] = useState<string[]>(
    assessment?.refs.map((r) => catalogKey(r.ref_type, r.ref_id)) ?? [],
  );
  const [queueForMeeting, setQueueForMeeting] = useState(
    assessment?.question_status === "queued_meeting",
  );
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  const relevantGroups = VRIO_CRITERION_SOURCES[criterion];
  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort((a, b) => {
        const ar = relevantGroups.indexOf(a.group);
        const br = relevantGroups.indexOf(b.group);
        return (ar === -1 ? 99 : ar) - (br === -1 ? 99 : br);
      }),
    [catalog, relevantGroups],
  );
  const byKey = useMemo(() => new Map(catalog.map((e) => [e.key, e])), [catalog]);

  const weakEvidence = (answer === "yes" || answer === "no") && (refKeys.length === 0 || motivation.trim().length < 10);
  const aiProposal =
    assessment && assessment.ai_state === "proposed" && assessment.ai_answer ? assessment : null;

  async function save(confirm: boolean, next: VrioCriterion | null | "stay") {
    if (!assessment) return;
    const ok = await run("assessment", () =>
      saveVrioAssessmentAction(tenantId, {
        versionId: wb.version.id,
        assessmentId: assessment.id,
        answer,
        motivation,
        evidenceLevel: answer === "unknown" ? "hypothesis" : evidenceLevel,
        advisorNote,
        openQuestion,
        skippedReason,
        refKeys,
        confirm,
      }),
    );
    if (!ok) return;

    if (queueForMeeting && openQuestion.trim().length >= 3) {
      await run("question", () =>
        updateVrioQuestionAction(tenantId, {
          assessmentId: assessment.id,
          status: "queued_meeting",
          answer: openQuestion,
        }),
      );
    }

    if (next !== "stay") onNavigate(next);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-vice-text-muted hover:text-vice-gold"
      >
        <ChevronLeft className="size-4" aria-hidden /> Beoordeling
      </button>

      <h1 className="mt-3 text-2xl font-semibold text-vice-text">{resource.title}</h1>
      {resource.market_context && (
        <p className="mt-1 text-xs text-vice-text-muted">Context: {resource.market_context}</p>
      )}

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Criteria">
        {VRIO_CRITERIA.map((c) => {
          const a = resource.assessments.find((x) => x.criterion === c);
          const m = VRIO_CRITERION_META[c];
          const active = c === criterion;
          const done = a && a.confirmed && a.answer !== "not_assessed";
          return (
            <button
              key={c}
              type="button"
              onClick={() => onNavigate(c)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                active ? "border-vice-gold bg-vice-gold/10 text-vice-text" : "border-vice-border text-vice-text-muted",
                done && !active && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  active ? "bg-vice-gold text-[#1a1814]" : "bg-vice-surface-muted",
                )}
              >
                {m.letter}
              </span>
              {m.label}
            </button>
          );
        })}
      </nav>

      <section className="mt-6 rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">{meta.question}</h2>
        <p className="mt-1 text-sm text-vice-text-muted">
          Onderbouwing uit: {meta.evidenceHint}. Een genoemde naam of claim bewijst op zich niets.
        </p>

        {aiProposal && (
          <div className="mt-4 rounded-xl border border-vice-gold/40 bg-vice-gold/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-vice-gold" aria-hidden />
              AI-voorstel: {VRIO_ANSWER_LABELS[aiProposal.ai_answer as VrioAnswer]}
            </p>
            {aiProposal.ai_motivation && <p className="mt-1 text-sm">{aiProposal.ai_motivation}</p>}
            {aiProposal.ai_missing_evidence && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Ontbrekend bewijs: {aiProposal.ai_missing_evidence}
              </p>
            )}
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 text-xs"
                  disabled={busy !== null}
                  onClick={async () => {
                    const ok = await run("proposal", () =>
                      resolveVrioAiProposalAction(tenantId, { assessmentId: aiProposal.id, accept: true }),
                    );
                    if (ok && aiProposal.ai_answer) {
                      setAnswer(aiProposal.ai_answer);
                      if (aiProposal.ai_motivation) setMotivation(aiProposal.ai_motivation);
                    }
                  }}
                >
                  Voorstel overnemen
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 text-xs"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("proposal", () =>
                      resolveVrioAiProposalAction(tenantId, { assessmentId: aiProposal.id, accept: false }),
                    )
                  }
                >
                  Afwijzen
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={meta.label}>
          {ANSWER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={answer === opt}
              disabled={readOnly}
              onClick={() => setAnswer(opt)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition",
                answer === opt ?
                  "border-vice-gold bg-vice-gold/10 font-medium text-vice-text"
                : "border-vice-border text-vice-text-muted hover:border-vice-gold/40",
              )}
            >
              <span
                className={cn(
                  "size-3 rounded-full border",
                  answer === opt ? "border-vice-gold bg-vice-gold" : "border-vice-border",
                )}
                aria-hidden
              />
              {VRIO_ANSWER_LABELS[opt]}
            </button>
          ))}
        </div>

        {answer === "unknown" && (
          <p className="mt-3 text-xs text-vice-text-muted">
            Onbekend blijft onbekend: dit telt niet als &quot;Nee&quot; en blokkeert een definitieve uitkomst.
          </p>
        )}

        {weakEvidence && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Nog onvoldoende onderbouwing: motiveer het antwoord en koppel een bron, of kies Onbekend.
          </p>
        )}

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Jouw onderbouwing</Label>
            <span className="text-[11px] text-vice-text-muted">{motivation.length}/1000</span>
          </div>
          <textarea
            className={cn(textareaClass, "min-h-[110px]")}
            maxLength={1000}
            disabled={readOnly}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder={`Wat maakt dit ${meta.label.toLowerCase()}?`}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Bewijsstatus</Label>
            <select
              className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              disabled={readOnly || answer === "unknown"}
              value={answer === "unknown" ? "hypothesis" : evidenceLevel}
              onChange={(e) => setEvidenceLevel(e.target.value as VrioEvidenceLevel)}
            >
              {(Object.keys(VRIO_EVIDENCE_LABELS) as VrioEvidenceLevel[]).map((k) => (
                <option key={k} value={k}>
                  {VRIO_EVIDENCE_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Eigen aanvulling</Label>
            <textarea
              className={cn(textareaClass, "min-h-[42px]")}
              disabled={readOnly}
              value={advisorNote}
              onChange={(e) => setAdvisorNote(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <Label>Bronnen</Label>
          <div className="flex flex-wrap items-center gap-2">
            {refKeys.map((key) => {
              const entry = byKey.get(key);
              if (!entry) return null;
              return (
                <RefChip
                  key={key}
                  tenantId={tenantId}
                  refType={entry.ref_type}
                  refId={entry.ref_id}
                  label={entry.label}
                  onRemove={readOnly ? undefined : () => setRefKeys((k) => k.filter((x) => x !== key))}
                />
              );
            })}
            {!readOnly && (
              <Button
                type="button"
                variant="secondary"
                className="h-7 gap-1 text-xs"
                onClick={() => setSourcePickerOpen((v) => !v)}
              >
                <Plus className="size-3.5" aria-hidden /> Bron koppelen
              </Button>
            )}
          </div>
          {sourcePickerOpen && !readOnly && (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-vice-border bg-vice-bg p-2">
              {sortedCatalog.map((e) => (
                <label key={e.key} className="flex cursor-pointer items-start gap-2 py-0.5 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={refKeys.includes(e.key)}
                    onChange={() =>
                      setRefKeys((k) => (k.includes(e.key) ? k.filter((x) => x !== e.key) : [...k, e.key]))
                    }
                  />
                  <span>
                    {e.label}
                    {relevantGroups.includes(e.group) && (
                      <Chip className="ml-1" tone="gold">
                        relevant
                      </Chip>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2 rounded-xl bg-vice-surface-muted/50 p-3">
          <Label>Ontbrekende informatie</Label>
          <input
            className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
            disabled={readOnly}
            value={openQuestion}
            onChange={(e) => setOpenQuestion(e.target.value)}
            placeholder={meta.gapQuestion}
          />
          <label className="flex items-center gap-2 text-xs text-vice-text-muted">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={queueForMeeting}
              onChange={(e) => setQueueForMeeting(e.target.checked)}
            />
            Vraag bewaren voor volgende meeting
          </label>
          {answer === "not_assessed" && (
            <input
              className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              disabled={readOnly}
              value={skippedReason}
              onChange={(e) => setSkippedReason(e.target.value)}
              placeholder="Reden om dit criterium over te slaan (de uitkomst staat al vast)"
            />
          )}
        </div>

        <p className="mt-4 text-xs text-vice-text-muted">
          Automatisch opslaan betekent niet goedkeuren: bevestig het antwoord zelf.
        </p>
      </section>

      {!readOnly && (
        <footer className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void save(false, "stay")}>
              Opslaan als concept
            </Button>
            <Button
              type="button"
              className={cn("gap-2", goldButtonClass)}
              disabled={busy !== null || answer === "not_assessed"}
              onClick={() => void save(true, VRIO_CRITERIA[index + 1] ?? null)}
            >
              {busy === "assessment" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {index === VRIO_CRITERIA.length - 1 ? "Opslaan en afronden" : "Opslaan en verder"}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
