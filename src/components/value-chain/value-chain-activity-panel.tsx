"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, RefChip, goldButtonClass, textareaClass } from "@/components/value-chain/value-chain-ui";
import {
  VC_CATEGORIES,
  VC_CATEGORY_GROUP,
  VC_CATEGORY_LABELS,
  VC_EFFECTS,
  VC_EFFECT_LABELS,
  VC_EVIDENCE_LABELS,
  VC_EXECUTION,
  VC_EXECUTION_LABELS,
  VC_TIME_BASIS,
  VC_TIME_BASIS_LABELS,
  type VcBusinessType,
  type VcCategory,
  type VcEvidence,
  type VcExecution,
  type VcTimeBasis,
} from "@/lib/value-chain/constants";
import { catalogKey, type VcCatalogEntry } from "@/lib/value-chain/input-catalog";
import { formatMinor, timeToCost, toMinor } from "@/lib/value-chain/finance";
import type { VcActivity, VcAllocation, VcLine } from "@/lib/value-chain/types";
import { cn } from "@/lib/utils";

export function ValueChainActivityPanel({
  tenantId,
  activity,
  businessType,
  catalog,
  lines,
  allocations,
  financeAccess,
  costRate,
  costRateConfirmed,
  costRateUnit,
  currency,
  readOnly,
  busy,
  duplicateTime,
  onBack,
  onSave,
  onReview,
  onResolveAi,
  onOpenFinance,
  onAddDependency,
  onDeleteDependency,
  onExclude,
  onArchive,
  otherActivities,
  vrioResources,
}: {
  tenantId: string;
  activity: VcActivity;
  businessType: VcBusinessType;
  catalog: VcCatalogEntry[];
  lines: (VcLine & { scale: "units" | "thousands" | "millions"; currency: string })[];
  allocations: VcAllocation[];
  financeAccess: boolean;
  costRate: string | null;
  costRateConfirmed: boolean;
  costRateUnit: string;
  currency: string;
  readOnly: boolean;
  busy: string | null;
  duplicateTime: boolean;
  onBack: () => void;
  onSave: (patch: ActivityPatch) => Promise<void>;
  onReview: () => Promise<void>;
  onResolveAi: (accept: boolean) => Promise<void>;
  onOpenFinance: () => void;
  onAddDependency: (input: { toActivityId: string | null; vrioResourceId: string | null; partnerLabel: string; kind: string; description: string; evidenceLevel: VcEvidence }) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<void>;
  onExclude: (reason: string) => Promise<void>;
  onArchive: (detach: boolean) => Promise<void>;
  otherActivities: { id: string; name: string }[];
  vrioResources: { id: string; title: string }[];
}) {
  const [name, setName] = useState(activity.name);
  const [category, setCategory] = useState<VcCategory>(activity.category);
  const [description, setDescription] = useState(activity.description);
  const [inputsText, setInputsText] = useState(activity.inputs_text);
  const [outputsText, setOutputsText] = useState(activity.outputs_text);
  const [customerValue, setCustomerValue] = useState(activity.customer_value);
  const [capabilities, setCapabilities] = useState(activity.capabilities_note);
  const [owner, setOwner] = useState(activity.owner_name);
  const [execution, setExecution] = useState<VcExecution>(activity.execution);
  const [timeValue, setTimeValue] = useState(activity.time_value ?? "");
  const [timeUnit, setTimeUnit] = useState(activity.time_unit);
  const [timeScope, setTimeScope] = useState(activity.time_scope);
  const [timeBasis, setTimeBasis] = useState<VcTimeBasis>(activity.time_basis);
  const [timeSource, setTimeSource] = useState(activity.time_source);
  const [observation, setObservation] = useState(activity.bottleneck_observation);
  const [explanation, setExplanation] = useState(activity.bottleneck_explanation);
  const [improvement, setImprovement] = useState(activity.bottleneck_improvement);
  const [effect, setEffect] = useState(activity.bottleneck_effect || "unknown");
  const [motivation, setMotivation] = useState(activity.bottleneck_motivation);
  const [openQuestion, setOpenQuestion] = useState(activity.open_question);
  const [questionStatus, setQuestionStatus] = useState(activity.question_status);
  const [advisorNote, setAdvisorNote] = useState(activity.advisor_note);
  const [evidence, setEvidence] = useState<VcEvidence>(activity.evidence_level);
  const [subs, setSubs] = useState(activity.subactivities.map((sub) => sub.name).join("\n"));
  const [refKeys, setRefKeys] = useState(activity.refs.map((ref) => catalogKey(ref.ref_type, ref.ref_id)));
  const [picker, setPicker] = useState(false);
  const [depKind, setDepKind] = useState("activity");
  const [depTarget, setDepTarget] = useState("");
  const [depText, setDepText] = useState("");
  const [depEvidence, setDepEvidence] = useState<VcEvidence>("hypothesis");
  const [excludeReason, setExcludeReason] = useState("");

  const labels = VC_CATEGORY_LABELS[businessType];
  const ownAllocations = allocations.filter((allocation) => allocation.activity_id === activity.id);
  const timeCost = timeToCost(timeValue || null, timeUnit || "hour", costRate, costRateUnit, costRateConfirmed);

  function patch(reviewedQuestion = questionStatus): ActivityPatch {
    return {
      name,
      category,
      description,
      inputsText,
      outputsText,
      customerValue,
      capabilitiesNote: capabilities,
      ownerName: owner,
      execution,
      timeValue,
      timeUnit,
      timeScope,
      timeBasis,
      timeSource,
      observation,
      explanation,
      improvement,
      effect,
      motivation,
      openQuestion,
      questionStatus: reviewedQuestion,
      questionAnswer: activity.question_answer,
      advisorNote,
      evidenceLevel: evidence,
      refKeys,
      subactivities: subs.split("\n"),
    };
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <button type="button" className="text-sm text-vice-text-muted hover:text-vice-gold" onClick={onBack}>
        ← Waardeketen
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone="gold">{VC_CATEGORY_GROUP[category] === "support" ? "Ondersteunend" : "Primair"}</Chip>
        <Chip>{labels[category]}</Chip>
        {activity.needs_revision && <Chip tone="amber">Mogelijk verouderd</Chip>}
        {activity.review_status === "reviewed" && <Chip tone="green">Beoordeeld</Chip>}
      </div>
      <h1 className="mt-3 text-2xl font-semibold text-vice-text">{name || "Activiteit"}</h1>
      <p className="mt-1 text-xs text-vice-text-muted">Opslaan als concept is geen goedkeuring. De categorie blijft behouden als je de naam wijzigt.</p>

      {activity.ai_state === "proposed" && !readOnly && (
        <div className="mt-4 rounded-xl border border-vice-gold/40 bg-vice-gold/10 p-4 text-sm">
          <p className="font-medium">AI-voorstel, je tekst blijft staan</p>
          <p className="mt-1 text-vice-text-muted">{activity.ai_description || activity.ai_bottleneck || activity.ai_open_question}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" className={goldButtonClass} disabled={busy !== null} onClick={() => void onResolveAi(true)}>Overnemen</Button>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void onResolveAi(false)}>Afwijzen</Button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Field label="Naam">
          <Input value={name} disabled={readOnly} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Categorie">
          <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={category} disabled={readOnly} onChange={(event) => setCategory(event.target.value as VcCategory)}>
            {VC_CATEGORIES.map((item) => (
              <option key={item} value={item}>{labels[item]}</option>
            ))}
          </select>
        </Field>
        <Field label="Wat gebeurt hier?">
          <textarea className={cn(textareaClass, "min-h-[88px]")} value={description} disabled={readOnly} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Input"><textarea className={textareaClass} value={inputsText} disabled={readOnly} onChange={(event) => setInputsText(event.target.value)} /></Field>
          <Field label="Output"><textarea className={textareaClass} value={outputsText} disabled={readOnly} onChange={(event) => setOutputsText(event.target.value)} /></Field>
        </div>
        <Field label="Waarde voor de klant">
          <textarea className={textareaClass} value={customerValue} disabled={readOnly} onChange={(event) => setCustomerValue(event.target.value)} />
        </Field>
        <Field label="Middelen en competenties">
          <textarea className={textareaClass} value={capabilities} disabled={readOnly} onChange={(event) => setCapabilities(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eigenaar, indien bekend"><Input value={owner} disabled={readOnly} onChange={(event) => setOwner(event.target.value)} /></Field>
          <Field label="Uitvoering">
            <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={execution} disabled={readOnly} onChange={(event) => setExecution(event.target.value as VcExecution)}>
              {VC_EXECUTION.map((item) => <option key={item} value={item}>{VC_EXECUTION_LABELS[item]}</option>)}
            </select>
          </Field>
        </div>
        {execution === "external" && (
          <p className="text-xs text-amber-800 dark:text-amber-200">Uitbesteed: leg de partnerbijdrage vast. Er wordt geen interne capaciteit verondersteld.</p>
        )}

        <section className="rounded-xl border border-vice-border p-4">
          <h2 className="text-sm font-medium">Tijdsbesteding</h2>
          <p className="mt-1 text-xs text-vice-text-muted">Leeg betekent onbekend, niet nul. Een factuurtarief is geen interne kostprijs.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Waarde"><Input value={timeValue} disabled={readOnly} onChange={(event) => setTimeValue(event.target.value)} placeholder="Onbekend" /></Field>
            <Field label="Eenheid"><Input value={timeUnit} disabled={readOnly} onChange={(event) => setTimeUnit(event.target.value)} placeholder="uur, dag, opdracht" /></Field>
            <Field label="Scope"><Input value={timeScope} disabled={readOnly} onChange={(event) => setTimeScope(event.target.value)} placeholder="per opdracht, klant of periode" /></Field>
            <Field label="Onderbouwing">
              <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={timeBasis} disabled={readOnly} onChange={(event) => setTimeBasis(event.target.value as VcTimeBasis)}>
                {VC_TIME_BASIS.map((item) => <option key={item} value={item}>{VC_TIME_BASIS_LABELS[item]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Bron van de tijd">
            <Input className="mt-1" value={timeSource} disabled={readOnly} onChange={(event) => setTimeSource(event.target.value)} />
          </Field>
          {duplicateTime && <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Dezelfde tijd staat ook bij een andere activiteit. Tel die niet twee keer mee.</p>}
          {financeAccess && (
            <p className="mt-2 text-xs text-vice-text-muted">
              {"error" in timeCost ? timeCost.error : `Kost van deze tijd: ${formatMinor(timeCost.minor, currency)}. Alleen omdat de kostprijs bevestigd is.`}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-vice-border p-4">
          <h2 className="text-sm font-medium">Kosten</h2>
          {!financeAccess && <p className="mt-2 text-sm text-vice-text-muted">Financiële details zijn afgeschermd.</p>}
          {financeAccess && ownAllocations.length === 0 && <p className="mt-2 text-sm">Onbekend. Er is nog geen bevestigde kost gekoppeld.</p>}
          {financeAccess && ownAllocations.map((allocation) => {
            const line = lines.find((item) => item.id === allocation.line_id);
            const minor = line ? toMinor(allocation.amount, line.scale, "point").minor : null;
            return (
              <p key={allocation.id} className="mt-2 text-sm">
                {minor == null ? "Bedrag onbekend" : formatMinor(minor, line?.currency || currency)} · {allocation.status === "confirmed" ? "bevestigd" : "voorlopig"} · {allocation.method}
                {allocation.formula ? ` · ${allocation.formula}` : ""}
              </p>
            );
          })}
          <Button type="button" variant="secondary" className="mt-3 h-8 text-xs" onClick={onOpenFinance}>Bekijk kostentoewijzing</Button>
        </section>

        <section className="rounded-xl border border-vice-border p-4 space-y-3">
          <h2 className="text-sm font-medium">Knelpunt</h2>
          <p className="text-xs text-vice-text-muted">Een dure activiteit is niet automatisch verspilling. Waarneming, verklaring en verbetering blijven apart.</p>
          <Field label="Waarneming"><textarea className={textareaClass} value={observation} disabled={readOnly} onChange={(event) => setObservation(event.target.value)} /></Field>
          <Field label="Mogelijke verklaring"><textarea className={textareaClass} value={explanation} disabled={readOnly} onChange={(event) => setExplanation(event.target.value)} /></Field>
          <Field label="Mogelijke verbetering, nog geen besluit"><textarea className={textareaClass} value={improvement} disabled={readOnly} onChange={(event) => setImprovement(event.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Effect">
              <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={effect} disabled={readOnly} onChange={(event) => setEffect(event.target.value)}>
                {VC_EFFECTS.map((item) => <option key={item} value={item}>{VC_EFFECT_LABELS[item]}</option>)}
              </select>
            </Field>
            <Field label="Motivatie van urgentie"><Input value={motivation} disabled={readOnly} onChange={(event) => setMotivation(event.target.value)} /></Field>
          </div>
        </section>

        <div className="space-y-2">
          <p className="text-sm text-vice-text-muted">Afhankelijkheden</p>
          {activity.dependencies.length === 0 && <p className="text-sm text-vice-text-muted">Nog geen koppeling. Die verschijnt alleen bij deze activiteit.</p>}
          <ul className="space-y-1 text-sm">
            {activity.dependencies.map((dependency) => (
              <li key={dependency.id} className="flex items-center gap-2">
                <span>{dependency.description || dependency.partner_label || dependency.kind}</span>
                {dependency.evidence_level === "hypothesis" && <Chip tone="amber">Hypothese</Chip>}
                {!readOnly && <button type="button" className="text-xs text-vice-text-muted hover:text-rose-600" onClick={() => void onDeleteDependency(dependency.id)}>Verwijderen</button>}
              </li>
            ))}
          </ul>
          {!readOnly && activity.id && (
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={depKind} onChange={(event) => setDepKind(event.target.value)}>
                <option value="activity">Andere activiteit</option>
                <option value="resource">VRIO-middel</option>
                <option value="partner">Partner</option>
                <option value="person">Persoon</option>
              </select>
              {depKind === "activity" && (
                <select className="rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={depTarget} onChange={(event) => setDepTarget(event.target.value)}>
                  <option value="">Kies een activiteit</option>
                  {otherActivities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              )}
              {depKind === "resource" && (
                <select className="rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={depTarget} onChange={(event) => setDepTarget(event.target.value)}>
                  <option value="">Kies een middel</option>
                  {vrioResources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              )}
              <Input value={depText} onChange={(event) => setDepText(event.target.value)} placeholder="Wat is de afhankelijkheid?" />
              <Button type="button" variant="secondary" disabled={busy !== null || depText.trim().length < 3} onClick={() => void onAddDependency({
                toActivityId: depKind === "activity" ? depTarget || null : null,
                vrioResourceId: depKind === "resource" ? depTarget || null : null,
                partnerLabel: depKind === "partner" || depKind === "person" ? depText : "",
                kind: depKind,
                description: depText,
                evidenceLevel: depEvidence,
              })}>
                Afhankelijkheid vastleggen
              </Button>
              <select className="rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={depEvidence} onChange={(event) => setDepEvidence(event.target.value as VcEvidence)}>
                {(Object.keys(VC_EVIDENCE_LABELS) as VcEvidence[]).map((item) => <option key={item} value={item}>{VC_EVIDENCE_LABELS[item]}</option>)}
              </select>
            </div>
          )}
        </div>

        <Field label="Subactiviteiten, één per regel">
          <textarea className={cn(textareaClass, "min-h-[72px]")} value={subs} disabled={readOnly} onChange={(event) => setSubs(event.target.value)} />
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <Label>Bronnen</Label>
            {!readOnly && <Button type="button" variant="secondary" className="h-7 text-xs" onClick={() => setPicker((open) => !open)}>Bron koppelen</Button>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activity.refs.map((ref, index) => (
              <RefChip key={`${ref.ref_type}-${index}`} tenantId={tenantId} refType={ref.ref_type} label={ref.interpretation ? `Afgeleid · ${ref.label}` : ref.label} />
            ))}
            {refKeys.length === 0 && <span className="text-xs text-vice-text-muted">Nog geen bron. Zonder bron blijft dit een hypothese.</span>}
          </div>
          {picker && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-vice-border p-2">
              {catalog.map((entry) => (
                <label key={entry.key} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={refKeys.includes(entry.key)} onChange={() => setRefKeys((keys) => keys.includes(entry.key) ? keys.filter((key) => key !== entry.key) : [...keys, entry.key])} />
                  <span>{entry.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Field label="Bewijsstatus">
          <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={evidence} disabled={readOnly} onChange={(event) => setEvidence(event.target.value as VcEvidence)}>
            {(Object.keys(VC_EVIDENCE_LABELS) as VcEvidence[]).map((item) => <option key={item} value={item}>{VC_EVIDENCE_LABELS[item]}</option>)}
          </select>
        </Field>
        <Field label="Open vraag">
          <textarea className={textareaClass} value={openQuestion} disabled={readOnly} onChange={(event) => setOpenQuestion(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={readOnly} checked={questionStatus === "queued_meeting"} onChange={(event) => setQuestionStatus(event.target.checked ? "queued_meeting" : "open")} />
          Vraag bewaren voor een volgende meeting
        </label>
        <Field label="Eigen aanvulling">
          <textarea className={textareaClass} value={advisorNote} disabled={readOnly} onChange={(event) => setAdvisorNote(event.target.value)} />
        </Field>
      </div>

      {!readOnly && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void onSave(patch())}>
            {busy === "activity" && <Loader2 className="size-4 animate-spin" aria-hidden />} Opslaan als concept
          </Button>
          {activity.id && (
            <Button
              type="button"
              className={goldButtonClass}
              disabled={busy !== null}
              onClick={() => void (async () => { await onSave(patch()); await onReview(); })()}
            >
              Markeren als beoordeeld
            </Button>
          )}
        </div>
      )}
      {!readOnly && activity.id && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-vice-border pt-4">
          <Input value={excludeReason} onChange={(event) => setExcludeReason(event.target.value)} placeholder="Reden om uit te sluiten" className="max-w-xs" />
          <Button type="button" variant="secondary" disabled={busy !== null || excludeReason.trim().length < 3} onClick={() => void onExclude(excludeReason)}>Niet van toepassing</Button>
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void onArchive(window.confirm("Gekoppelde kosten gaan terug naar niet-toegewezen. Doorgaan?"))}>Archiveren</Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-vice-text-muted">{label}</span>
      {children}
    </label>
  );
}

export type ActivityPatch = {
  name: string;
  category: VcCategory;
  description: string;
  inputsText: string;
  outputsText: string;
  customerValue: string;
  capabilitiesNote: string;
  ownerName: string;
  execution: VcExecution;
  timeValue: string;
  timeUnit: string;
  timeScope: string;
  timeBasis: VcTimeBasis;
  timeSource: string;
  observation: string;
  explanation: string;
  improvement: string;
  effect: string;
  motivation: string;
  openQuestion: string;
  questionStatus: string;
  questionAnswer: string;
  advisorNote: string;
  evidenceLevel: VcEvidence;
  refKeys: string[];
  subactivities: string[];
};
