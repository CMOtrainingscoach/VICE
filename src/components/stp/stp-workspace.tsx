"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AuditStepNav } from "@/components/audit/audit-step-nav";
import { Button } from "@/components/ui/button";
import { Chip, Field, fieldClass, goldButtonClass } from "@/components/stp/stp-ui";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { buildStpCatalog, customerSignalCount } from "@/lib/stp/catalog";
import { activeSegments, approvalBlocked, segmentSignals, stpChecks } from "@/lib/stp/checks";
import {
  STP_CLAIM_LABELS,
  STP_CLAIMS,
  STP_CRITERION_KINDS,
  STP_CRITERION_LABELS,
  STP_DIMENSIONS,
  STP_DIMENSION_LABELS,
  STP_DISPOSITION_LABELS,
  STP_FRAMEWORK_INDEX,
  STP_RATING_LABELS,
  STP_RATINGS,
  STP_STATUS_LABELS,
  type StpClaim,
  type StpCriterionKind,
  type StpDimension,
  type StpDisposition,
  type StpRating,
  type StpStep,
} from "@/lib/stp/constants";
import type { StpCriterion, StpRef, StpSegment, StpWorkbench } from "@/lib/stp/types";
import { PERSONA_ROUTE } from "@/lib/value-chain/constants";
import {
  applyStpProposalAction,
  approveStpAction,
  archiveStpSegmentAction,
  confirmStpPositionAction,
  confirmStpSegmentsAction,
  confirmStpTargetAction,
  createStpRevisionAction,
  exportStpTextAction,
  loadStpWorkbenchAction,
  mergeStpSegmentsAction,
  composeStpSentenceAction,
  proposeStpIcpAction,
  proposeStpPositionAction,
  proposeStpSegmentsAction,
  proposeStpTargetAction,
  publishStpAction,
  resolveStpProposalAction,
  saveStpIcpAction,
  saveStpPositionAction,
  saveStpScopeAction,
  saveStpScoresAction,
  saveStpSegmentAction,
  setStpDispositionAction,
  setStpStepAction,
  unpublishStpAction,
} from "@/modules/stp/actions";

const STEPS: { id: Exclude<StpStep, "intake">; label: string; question: string }[] = [
  { id: "segments", label: "Segmentatie", question: "Welke klantgroepen hebben een vergelijkbare behoefte?" },
  { id: "target", label: "Targeting", question: "Op welke klantgroep richten we ons eerst?" },
  { id: "position", label: "Positionering", question: "Waarom kiest deze doelgroep voor dit bedrijf?" },
  { id: "icp", label: "Jouw ICP", question: "Hoe herkennen we een ideale klant?" },
];

type SaveState = "idle" | "saving" | "saved" | "unsaved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Opgeslagen",
  saving: "Opslaan…",
  saved: "Opgeslagen",
  unsaved: "Niet opgeslagen",
  error: "Niet opgeslagen",
};

export function StpWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: StpWorkbench;
}) {
  const [wb, setWb] = useState(initial);
  const [save, setSave] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<StpSegment | null>(null);
  const [confirming, setConfirming] = useState(false);
  const lock = useRef(false);
  const version = wb.version;
  const locked = version.status === "approved";
  const step: StpStep = version.current_step === "intake" ? "intake" : version.current_step;
  const visibleStep = step === "intake" ? "segments" : step;
  const segments = activeSegments(wb.segments);
  const checks = stpChecks(wb);
  const blocked = approvalBlocked(checks);
  const catalog = buildStpCatalog(wb.inputs);
  const thin = customerSignalCount(wb.inputs) === 0 && wb.inputs.meetings.length === 0;

  async function reload(versionId = version.id) {
    const next = await loadStpWorkbenchAction(tenantId, versionId);
    if (!next.ok || !next.data) {
      setError(next.ok ? "De analyse kon niet herladen worden." : next.error);
      setSave("error");
      return null;
    }
    setWb(next.data);
    setSave("saved");
    return next.data;
  }

  async function run(label: string, task: () => Promise<{ ok: boolean; error?: string; versionId?: string }>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    setSave("saving");
    try {
      const result = await task();
      if (!result.ok) {
        setError(result.error || "Dit is niet gelukt. Je vorige tekst blijft staan.");
        setSave("error");
        return;
      }
      await reload(result.versionId ?? version.id);
    } catch {
      setError("De verbinding viel weg. Je vorige tekst blijft staan. Probeer opnieuw.");
      setSave("error");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function go(next: StpStep) {
    if (locked) {
      setWb((prev) => ({ ...prev, version: { ...prev.version, current_step: next } }));
      return;
    }
    await run("Stap openen", async () => setStpStepAction(tenantId, { versionId: version.id, step: next }));
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10 print:max-w-none print:px-0">
      <header className="print:hidden">
        <p className="text-right text-xs text-vice-text-muted" aria-live="polite">{SAVE_LABEL[save]}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-vice-gold">
          {STP_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · STP · {tenantName} · versie {version.version_number} · {STP_STATUS_LABELS[version.status]}
        </p>
        <AuditStepNav />
        <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">
          {STEPS.find((item) => item.id === visibleStep)?.question}
        </h1>
        <ol className="mt-6 flex flex-wrap gap-2" aria-label="Stappen">
          {STEPS.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold ${item.id === visibleStep ? "bg-vice-text text-vice-bg" : "bg-vice-surface-muted text-vice-text-muted"}`}
                onClick={() => void go(item.id)}
              >
                {index + 1}. {item.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      {version.needs_review ? (
        <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 print:hidden">
          Opnieuw bekijken. {version.review_note || "Een gebruikte analyse is gewijzigd."} De vorige publicatie blijft staan tot je een nieuwe versie publiceert.
        </p>
      ) : null}
      {version.version_number > 1 && !locked ? (
        <p className="mt-4 text-sm text-vice-text-muted print:hidden">Er loopt een herziening. De klant ziet de vorige gepubliceerde versie tot je deze publiceert.</p>
      ) : null}
      {error ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200" role="alert">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-vice-text-muted">{notice}</p> : null}
      {busy ? <p className="mt-4 text-sm text-vice-text" aria-live="polite">{busy}</p> : null}

      <div className="mt-8">
        {step === "intake" ? (
          <Intake
            tenantId={tenantId}
            wb={wb}
            thin={thin}
            locked={locked}
            onChange={(offering, geography, scopeNote) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, offering, geography, scope_note: scopeNote } }));
              setSave("unsaved");
            }}
            onSave={() => void run("Aanbod bewaren", () => saveStpScopeAction(tenantId, {
              versionId: version.id,
              offering: version.offering,
              geography: version.geography,
              note: version.scope_note,
              confirm: version.offering.trim().length >= 2,
            }))}
            onPropose={() => void run(thin ? "Segmenten voorstellen" : "Segmenten voorstellen op basis van het dossier", async () => {
              const scoped = await saveStpScopeAction(tenantId, {
                versionId: version.id,
                offering: version.offering,
                geography: version.geography,
                note: version.scope_note,
                confirm: version.offering.trim().length >= 2,
              });
              if (!scoped.ok) return scoped;
              const fresh = await loadStpWorkbenchAction(tenantId, version.id);
              if (!fresh.ok || !fresh.data) return { ok: false, error: fresh.ok ? "Herladen mislukt" : fresh.error };
              return proposeStpSegmentsAction(tenantId, { versionId: version.id, expectedUpdatedAt: fresh.data.version.updated_at });
            })}
          />
        ) : null}

        {visibleStep === "segments" && step !== "intake" ? (
          <SegmentsStep
            segments={segments}
            all={wb.segments}
            locked={locked}
            confirmed={version.segments_confirmed}
            onEdit={setEditing}
            onAdd={() => setEditing(blankSegment(version.offering))}
            onPropose={() => void run("Segmenten voorstellen op basis van het dossier", () => proposeStpSegmentsAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }))}
            onConfirm={() => void run("Segmenten bevestigen", () => confirmStpSegmentsAction(tenantId, { versionId: version.id }))}
            onCompare={() => void go("target")}
          />
        ) : null}

        {visibleStep === "target" ? (
          <TargetStep
            wb={wb}
            segments={segments}
            locked={locked}
            onMotivation={(target_motivation) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, target_motivation } }));
              setSave("unsaved");
            }}
            onDisposition={(segmentId, disposition, reason) => void run("Doelgroep bijwerken", () => setStpDispositionAction(tenantId, { segmentId, disposition, reason }))}
            onScore={(segmentId, dimension, rating, note) => void run("Beoordeling bewaren", () => saveStpScoresAction(tenantId, {
              segmentId,
              scores: [{ dimension, rating, note, assumption: "" }],
            }))}
            onCompare={() => void run("Segmenten vergelijken", () => proposeStpTargetAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }))}
            onConfirm={() => void run("Doelgroep bevestigen", () => confirmStpTargetAction(tenantId, { versionId: version.id, motivation: version.target_motivation }))}
          />
        ) : null}

        {visibleStep === "position" ? (
          <PositionStep
            wb={wb}
            locked={locked}
            onChange={(patch) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, ...patch } }));
              setSave("unsaved");
            }}
            onSave={() => void run("Positionering bewaren", () => saveStpPositionAction(tenantId, positionInput(wb)))}
            onComposeSentence={() => void run("Positioneringszin maken op basis van deze pagina en de eerdere analyses", async () => {
              const saved = await saveStpPositionAction(tenantId, positionInput(wb));
              if (!saved.ok) return saved;
              const fresh = await loadStpWorkbenchAction(tenantId, version.id);
              if (!fresh.ok || !fresh.data) return { ok: false, error: fresh.ok ? "Herladen mislukt" : fresh.error };
              return composeStpSentenceAction(tenantId, { versionId: version.id, expectedUpdatedAt: fresh.data.version.updated_at });
            })}
            onPropose={() => void run("Positionering voorstellen", async () => {
              const saved = await saveStpPositionAction(tenantId, positionInput(wb));
              if (!saved.ok) return saved;
              const fresh = await loadStpWorkbenchAction(tenantId, version.id);
              if (!fresh.ok || !fresh.data) return { ok: false, error: fresh.ok ? "Herladen mislukt" : fresh.error };
              return proposeStpPositionAction(tenantId, { versionId: version.id, expectedUpdatedAt: fresh.data.version.updated_at });
            })}
            onApply={() => void run("Voorstel in lege velden zetten", () => applyStpProposalAction(tenantId, { versionId: version.id, kind: "position" }))}
            onConfirm={() => void run("Positionering bevestigen", async () => {
              const saved = await saveStpPositionAction(tenantId, positionInput(wb));
              if (!saved.ok) return saved;
              return confirmStpPositionAction(tenantId, { versionId: version.id });
            })}
            onNext={() => void go("icp")}
          />
        ) : null}

        {visibleStep === "icp" ? (
          <IcpStep
            tenantId={tenantId}
            tenantName={tenantName}
            wb={wb}
            segments={segments}
            checks={checks}
            blocked={blocked}
            locked={locked}
            confirming={confirming}
            onChange={(patch, criteria) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, ...patch }, criteria: criteria ?? prev.criteria }));
              setSave("unsaved");
            }}
            onSave={() => void run("ICP bewaren", () => saveStpIcpAction(tenantId, icpInput(wb)))}
            onPropose={() => void run("ICP samenstellen", async () => {
              const saved = await saveStpIcpAction(tenantId, icpInput(wb));
              if (!saved.ok) return saved;
              const fresh = await loadStpWorkbenchAction(tenantId, version.id);
              if (!fresh.ok || !fresh.data) return { ok: false, error: fresh.ok ? "Herladen mislukt" : fresh.error };
              return proposeStpIcpAction(tenantId, { versionId: version.id, expectedUpdatedAt: fresh.data.version.updated_at });
            })}
            onApply={() => void run("Voorstel in lege velden zetten", () => applyStpProposalAction(tenantId, { versionId: version.id, kind: "icp" }))}
            onAsk={() => setConfirming(true)}
            onApprove={() => void run("ICP goedkeuren", () => approveStpAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }))}
            onPublish={() => void run("Publiceren", () => publishStpAction(tenantId, { versionId: version.id }))}
            onUnpublish={() => void run("Publicatie intrekken", () => unpublishStpAction(tenantId, { versionId: version.id }))}
            onRevision={() => void run("Nieuwe conceptversie", async () => {
              const created = await createStpRevisionAction(tenantId, { versionId: version.id });
              if (!created.ok || !created.data) return { ok: false, error: created.ok ? "Geen nieuwe versie" : created.error };
              return { ok: true, versionId: created.data.versionId };
            })}
            onExport={async () => {
              const exported = await exportStpTextAction(tenantId, { versionId: version.id });
              if (!exported.ok || !exported.data) {
                setError(exported.ok ? "Export mislukt" : exported.error);
                return;
              }
              await navigator.clipboard.writeText(exported.data.text);
              setNotice(version.status === "approved" ? "Tekst gekopieerd." : "Concepttekst gekopieerd. Het label Concept-ICP staat erbij.");
            }}
            onPrint={() => window.print()}
          />
        ) : null}
      </div>

      <Sources catalogCount={catalog.length} version={version} />

      {editing ? (
        <SegmentDialog
          segment={editing}
          others={segments.filter((item) => item.id && item.id !== editing.id)}
          catalog={catalog}
          locked={locked}
          onClose={() => setEditing(null)}
          onSave={(draft) => void run("Segment bewaren", async () => {
            const saved = await saveStpSegmentAction(tenantId, {
              versionId: version.id,
              segmentId: draft.id || null,
              name: draft.name,
              description: draft.description,
              need: draft.need,
              traits: draft.traits,
              geography: draft.geography,
              triggerText: draft.trigger_text,
              offering: draft.offering,
              includeCriteria: draft.include_criteria,
              excludeCriteria: draft.exclude_criteria,
              assumptions: draft.assumptions,
              openQuestion: draft.open_question,
              hypothesis: draft.hypothesis,
              refs: draft.refs,
            });
            setEditing(null);
            return saved;
          })}
          onArchive={() => {
            if (!editing.id) return;
            setEditing(null);
            void run("Segment archiveren", () => archiveStpSegmentAction(tenantId, { segmentId: editing.id }));
          }}
          onMerge={(dropId) => {
            if (!editing.id) return;
            setEditing(null);
            void run("Segmenten samenvoegen", () => mergeStpSegmentsAction(tenantId, { keepId: editing.id, dropId }));
          }}
          onResolve={(accept) => {
            if (!editing.id) return;
            setEditing(null);
            void run(accept ? "Voorstel overnemen" : "Voorstel sluiten", () => resolveStpProposalAction(tenantId, { segmentId: editing.id, accept }));
          }}
        />
      ) : null}
    </div>
  );
}

function blankSegment(offering: string): StpSegment {
  return {
    id: "",
    name: "",
    description: "",
    need: "",
    traits: "",
    geography: "",
    trigger_text: "",
    offering,
    include_criteria: "",
    exclude_criteria: "",
    assumptions: "",
    open_question: "",
    hypothesis: true,
    disposition: "unset",
    exclusion_reason: "",
    overlap_note: "",
    manual_lock: false,
    origin: "manual",
    ai_state: "none",
    ai_payload: {},
    archived_at: null,
    sort_order: 0,
    updated_at: "",
    scores: [],
    refs: [],
  };
}

function positionInput(wb: StpWorkbench) {
  const version = wb.version;
  return {
    versionId: version.id,
    audience: version.audience,
    problem: version.problem,
    promise: version.promise,
    distinction: version.distinction,
    evidenceText: version.evidence_text,
    sentence: version.position_sentence,
    claimStatus: version.claim_status,
  };
}

function icpInput(wb: StpWorkbench) {
  const version = wb.version;
  return {
    versionId: version.id,
    icpName: version.icp_name,
    icpSummary: version.icp_summary,
    icpSector: version.icp_sector,
    icpStage: version.icp_stage,
    icpSize: version.icp_size,
    icpStructure: version.icp_structure,
    icpTech: version.icp_tech,
    icpProblem: version.icp_problem,
    icpNeed: version.icp_need,
    icpOutcome: version.icp_outcome,
    icpTrigger: version.icp_trigger,
    icpInaction: version.icp_inaction,
    icpBudget: version.icp_budget,
    icpCapacity: version.icp_capacity,
    icpConditions: version.icp_conditions,
    icpTiming: version.icp_timing,
    assumptions: version.assumptions,
    openQuestions: version.open_questions,
    acceptedUncertainty: version.accepted_uncertainty,
    criteria: wb.criteria.map((item) => ({ kind: item.kind, body: item.body })),
  };
}

function Intake({
  tenantId,
  wb,
  thin,
  locked,
  onChange,
  onSave,
  onPropose,
}: {
  tenantId: string;
  wb: StpWorkbench;
  thin: boolean;
  locked: boolean;
  onChange: (offering: string, geography: string, note: string) => void;
  onSave: () => void;
  onPropose: () => void;
}) {
  const version = wb.version;
  const present = [
    version.pestel_version_id ? "PESTEL" : "",
    version.porter_version_id ? "Porter" : "",
    version.five_c_version_id ? "5C" : "",
    version.swot_version_id ? "SWOT" : "",
    version.vrio_version_id ? "VRIO" : "",
    version.bcg_version_id ? "BCG" : "",
    version.vc_version_id ? "Waardeketen" : "",
  ].filter(Boolean);
  const missing = ["PESTEL", "Porter", "5C", "SWOT", "VRIO", "BCG", "Waardeketen"].filter((name) => !present.includes(name));
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-vice-text">Dit weten we al over je markt en klanten.</h2>
        <p className="mt-2 max-w-prose text-sm text-vice-text-muted">Alleen goedgekeurde analyses van dit dossier. Ontbrekende cijfers blijven leeg.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Aanbod">
          <input className={fieldClass} value={version.offering} disabled={locked} onChange={(event) => onChange(event.target.value, version.geography, version.scope_note)} onBlur={onSave} />
        </Field>
        <Field label="Geografische scope">
          <input className={fieldClass} value={version.geography} disabled={locked} onChange={(event) => onChange(version.offering, event.target.value, version.scope_note)} onBlur={onSave} />
        </Field>
      </div>
      <p className="text-sm text-vice-text">Beschikbaar: {present.length ? present.join(", ") : "nog geen goedgekeurde analyse"}.</p>
      {missing.length ? <p className="text-sm text-vice-text-muted">Ontbreekt: {missing.join(", ")}. Concepten mogen verder, conclusies blijven dan onzeker.</p> : null}
      <p className="text-sm text-vice-text-muted">Klantinzichten: {wb.inputs.five_c_items.length} uit de 5C, {wb.inputs.meetings.length} meetings. Capaciteiten: {wb.inputs.vrio_resources.length}.</p>
      <div className="flex flex-wrap justify-end gap-3">
        {thin ? (
          <Button type="button" asChild className={goldButtonClass}>
            <Link href={`/klanten/${tenantId}/meetings/nieuw`}>Voeg klantinformatie toe</Link>
          </Button>
        ) : (
          <Button type="button" className={goldButtonClass} disabled={locked} onClick={onPropose}>Stel segmenten voor</Button>
        )}
        {thin ? <Button type="button" variant="secondary" disabled={locked} onClick={onPropose}>Toch een hypothese laten voorstellen</Button> : null}
      </div>
    </section>
  );
}

function SegmentsStep({
  segments,
  all,
  locked,
  confirmed,
  onEdit,
  onAdd,
  onPropose,
  onConfirm,
  onCompare,
}: {
  segments: StpSegment[];
  all: StpSegment[];
  locked: boolean;
  confirmed: boolean;
  onEdit: (segment: StpSegment) => void;
  onAdd: () => void;
  onPropose: () => void;
  onConfirm: () => void;
  onCompare: () => void;
}) {
  return (
    <section className="space-y-4">
      <p className="max-w-prose text-sm text-vice-text-muted">Een segment deelt een behoefte. Drie tot vijf is genoeg wanneer het dossier dat draagt. Minder mag.</p>
      {segments.length === 0 ? <p className="text-sm text-vice-text">Nog geen segment. Stel er een voor of voeg er zelf een toe.</p> : null}
      <ul className="space-y-3">
        {segments.map((segment) => {
          const signals = segmentSignals(segment, all);
          return (
            <li key={segment.id}>
              <button type="button" className="w-full rounded-xl border border-vice-border bg-vice-surface p-4 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold" onClick={() => onEdit(segment)}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-vice-text">{segment.name}</span>
                  {segment.hypothesis ? <Chip tone="amber">Hypothese</Chip> : <Chip tone="green">Onderbouwd</Chip>}
                  {segment.disposition !== "unset" ? <Chip>{STP_DISPOSITION_LABELS[segment.disposition]}</Chip> : null}
                  {segment.ai_state === "proposed" ? <Chip tone="gold">AI-voorstel</Chip> : null}
                </span>
                <span className="mt-2 block text-sm text-vice-text-muted">{segment.need || "Behoefte nog leeg"}</span>
                {signals.map((signal) => <span key={signal} className="mt-2 block text-xs text-vice-text-muted">{signal}</span>)}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" disabled={locked} onClick={onPropose}>Stel segmenten voor</Button>
        <Button type="button" variant="secondary" disabled={locked} onClick={onAdd}>+ Segment</Button>
        {confirmed ? (
          <Button type="button" className={goldButtonClass} onClick={onCompare}>Vergelijk doelgroepen</Button>
        ) : (
          <Button type="button" className={goldButtonClass} disabled={locked || segments.length === 0} onClick={onConfirm}>Bevestig segmenten</Button>
        )}
      </div>
    </section>
  );
}

function TargetStep({
  wb,
  segments,
  locked,
  onMotivation,
  onDisposition,
  onScore,
  onCompare,
  onConfirm,
}: {
  wb: StpWorkbench;
  segments: StpSegment[];
  locked: boolean;
  onMotivation: (value: string) => void;
  onDisposition: (segmentId: string, disposition: StpDisposition, reason: string) => void;
  onScore: (segmentId: string, dimension: StpDimension, rating: StpRating, note: string) => void;
  onCompare: () => void;
  onConfirm: () => void;
}) {
  const version = wb.version;
  return (
    <section className="space-y-5">
      <p className="max-w-prose text-sm text-vice-text-muted">Onbekend is geen slechte score. Er is geen totaal en geen automatische winnaar.</p>
      {segments.length === 1 ? <p className="text-sm text-vice-text">Er is één segment. Er heeft geen vergelijking met een alternatief plaatsgevonden.</p> : null}
      {!version.segments_confirmed ? <p className="text-sm text-amber-800 dark:text-amber-200">Bevestig eerst de segmenten. Je mag hier wel al een conceptkeuze maken.</p> : null}
      <Button type="button" variant="ghost" disabled={locked || segments.length === 0} onClick={onCompare}>Vergelijk met het dossier</Button>
      {version.preference_note ? (
        <div className="rounded-xl border border-vice-border bg-vice-surface p-4 text-sm">
          <p className="font-medium">Voorstel, geen besluit</p>
          <p className="mt-2 text-vice-text">{version.preference_note}</p>
          {version.preference_tradeoffs ? <p className="mt-2 text-vice-text-muted">Afweging: {version.preference_tradeoffs}</p> : null}
          {version.preference_risks ? <p className="mt-2 text-vice-text-muted">Onzeker: {version.preference_risks}</p> : null}
        </div>
      ) : null}
      <ul className="space-y-4">
        {segments.map((segment) => (
          <li key={segment.id} className="rounded-xl border border-vice-border bg-vice-surface p-4">
            <p className="font-medium text-vice-text">{segment.name}</p>
            <ul className="mt-3 space-y-2">
              {STP_DIMENSIONS.map((dimension) => {
                const score = segment.scores.find((item) => item.dimension === dimension);
                const rating = score?.rating ?? "unknown";
                return (
                  <li key={dimension} className="grid gap-2 sm:grid-cols-[11rem_8rem_1fr] sm:items-center">
                    <span className="text-sm text-vice-text-muted">{STP_DIMENSION_LABELS[dimension]}</span>
                    <select
                      className={fieldClass}
                      aria-label={`${STP_DIMENSION_LABELS[dimension]} voor ${segment.name}`}
                      value={rating}
                      disabled={locked}
                      onChange={(event) => onScore(segment.id, dimension, event.target.value as StpRating, score?.note ?? "")}
                    >
                      {STP_RATINGS.map((item) => <option key={item} value={item}>{STP_RATING_LABELS[item]}</option>)}
                    </select>
                    <span className="text-xs text-vice-text-muted">{score?.note || (rating === "unknown" ? "Nog niet onderbouwd" : "")}</span>
                  </li>
                );
              })}
            </ul>
            <DispositionChoice segment={segment} locked={locked} onDisposition={onDisposition} />
          </li>
        ))}
      </ul>
      <Field label="Waarom deze doelgroep eerst?">
        <textarea className={fieldClass} rows={3} value={version.target_motivation} disabled={locked} onChange={(event) => onMotivation(event.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" className={goldButtonClass} disabled={locked} onClick={onConfirm}>Bevestig doelgroep</Button>
      </div>
    </section>
  );
}

function DispositionChoice({
  segment,
  locked,
  onDisposition,
}: {
  segment: StpSegment;
  locked: boolean;
  onDisposition: (segmentId: string, disposition: StpDisposition, reason: string) => void;
}) {
  const [reason, setReason] = useState(segment.exclusion_reason);
  const [excluding, setExcluding] = useState(segment.disposition === "excluded");
  return (
    <fieldset className="mt-4 space-y-2" disabled={locked}>
      <legend className="text-xs font-medium text-vice-text-muted">Keuze</legend>
      {(["primary", "later", "not_priority", "excluded"] as const).map((disposition) => (
        <label key={disposition} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`disposition-${segment.id}`}
            checked={disposition === "excluded" ? excluding || segment.disposition === "excluded" : segment.disposition === disposition && !excluding}
            onChange={() => {
              if (disposition === "excluded") {
                setExcluding(true);
                return;
              }
              setExcluding(false);
              onDisposition(segment.id, disposition, "");
            }}
          />
          {STP_DISPOSITION_LABELS[disposition]}
        </label>
      ))}
      {excluding || segment.disposition === "excluded" ? (
        <label className="block space-y-1 text-sm">
          <span className="text-vice-text-muted">Waarom valt dit segment af?</span>
          <input
            className={fieldClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => {
              if (reason.trim().length >= 3) onDisposition(segment.id, "excluded", reason.trim());
            }}
          />
        </label>
      ) : null}
      {segment.exclusion_reason ? <p className="text-xs text-vice-text-muted">Reden: {segment.exclusion_reason}</p> : null}
    </fieldset>
  );
}

function PositionStep({
  wb,
  locked,
  onChange,
  onSave,
  onComposeSentence,
  onPropose,
  onApply,
  onConfirm,
  onNext,
}: {
  wb: StpWorkbench;
  locked: boolean;
  onChange: (patch: Partial<StpWorkbench["version"]>) => void;
  onSave: () => void;
  onComposeSentence: () => void;
  onPropose: () => void;
  onApply: () => void;
  onConfirm: () => void;
  onNext: () => void;
}) {
  const version = wb.version;
  const proposal = version.ai_proposal;
  const hasProposal = typeof proposal.audience === "string" || typeof proposal.promise === "string";
  const fields: { key: "audience" | "problem" | "promise" | "distinction" | "evidence_text"; label: string }[] = [
    { key: "audience", label: "Voor wie zijn we er?" },
    { key: "problem", label: "Welk probleem helpen we oplossen?" },
    { key: "promise", label: "Welke waarde beloven we?" },
    { key: "distinction", label: "Wat maakt de aanpak onderscheidend?" },
    { key: "evidence_text", label: "Welk bewijs ondersteunt dit?" },
  ];
  return (
    <section className="space-y-4">
      <p className="max-w-prose text-sm text-vice-text-muted">Een relevante belofte hoeft niet uniek te zijn. Zonder bewijs blijft een claim een hypothese.</p>
      {!version.target_confirmed ? <p className="text-sm text-amber-800 dark:text-amber-200">De doelgroep is nog niet bevestigd. Wijzig die in Targeting, niet alleen hier.</p> : null}
      {fields.map((field) => (
        <Field key={field.key} label={field.label}>
          <textarea className={fieldClass} rows={2} disabled={locked} value={version[field.key]} onChange={(event) => onChange({ [field.key]: event.target.value })} onBlur={onSave} />
        </Field>
      ))}
      <Field label="Positioneringszin">
        <textarea className={fieldClass} rows={2} disabled={locked} value={version.position_sentence} onChange={(event) => onChange({ position_sentence: event.target.value })} onBlur={onSave} />
      </Field>
      <Button
        type="button"
        variant="secondary"
        disabled={locked}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onComposeSentence}
      >
        Maak de zin met AI
      </Button>
      <Field label="Status van de claim">
        <select className={fieldClass} disabled={locked} value={version.claim_status} onChange={(event) => onChange({ claim_status: event.target.value as StpClaim })} onBlur={onSave}>
          {STP_CLAIMS.map((claim) => <option key={claim} value={claim}>{STP_CLAIM_LABELS[claim]}</option>)}
        </select>
      </Field>
      <p className="text-sm"><Chip tone={version.claim_status === "supported" ? "green" : version.claim_status === "conflict" ? "amber" : "gold"}>{STP_CLAIM_LABELS[version.claim_status]}</Chip></p>
      {hasProposal ? (
        <div className="rounded-xl border border-vice-border bg-vice-surface-muted p-4 text-sm">
          <p className="font-medium">Voorstel voor lege velden</p>
          <p className="mt-2 text-vice-text-muted">{String(proposal.position_sentence || proposal.promise || "")}</p>
          <Button type="button" className="mt-3" variant="secondary" disabled={locked} onClick={onApply}>Neem lege velden over</Button>
        </div>
      ) : null}
      <details className="text-sm text-vice-text-muted">
        <summary className="cursor-pointer">Positioneringskaart</summary>
        <p className="mt-2">Die kaart verschijnt pas wanneer de assen en de posities onderbouwd zijn. Ze is niet nodig om het ICP af te ronden.</p>
      </details>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" disabled={locked} onClick={onPropose}>Stel positionering voor</Button>
        {version.position_confirmed ? (
          <Button type="button" className={goldButtonClass} onClick={onNext}>Maak mijn ICP</Button>
        ) : (
          <Button type="button" className={goldButtonClass} disabled={locked} onClick={onConfirm}>Bevestig positionering</Button>
        )}
      </div>
    </section>
  );
}

function IcpStep({
  tenantId,
  tenantName,
  wb,
  segments,
  checks,
  blocked,
  locked,
  confirming,
  onChange,
  onSave,
  onPropose,
  onApply,
  onAsk,
  onApprove,
  onPublish,
  onUnpublish,
  onRevision,
  onExport,
  onPrint,
}: {
  tenantId: string;
  tenantName: string;
  wb: StpWorkbench;
  segments: StpSegment[];
  checks: ReturnType<typeof stpChecks>;
  blocked: boolean;
  locked: boolean;
  confirming: boolean;
  onChange: (patch: Partial<StpWorkbench["version"]>, criteria?: StpCriterion[]) => void;
  onSave: () => void;
  onPropose: () => void;
  onApply: () => void;
  onAsk: () => void;
  onApprove: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onRevision: () => void;
  onExport: () => void;
  onPrint: () => void;
}) {
  const version = wb.version;
  const primary = segments.find((segment) => segment.disposition === "primary");
  const proposal = version.ai_proposal;
  const levelLabel = { ready: "Gereed", attention: "Aandachtspunt", block: "Blokkeert goedkeuring" } as const;
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-vice-border bg-vice-surface p-5 shadow-sm" id="stp-print">
        <p className="text-xs uppercase tracking-wide text-vice-gold">{locked ? "Goedgekeurd ICP" : "Concept-ICP"} · {tenantName} · versie {version.version_number}</p>
        {locked ? <h2 className="mt-3 text-xl font-semibold text-vice-text">Je ideale klant is vastgelegd.</h2> : null}
        <Field label="Profielnaam">
          <input className={fieldClass} disabled={locked} value={version.icp_name} onChange={(event) => onChange({ icp_name: event.target.value })} onBlur={onSave} />
        </Field>
        <div className="mt-3">
          <Field label="Beschrijving van het ideale klantbedrijf">
            <textarea className={fieldClass} rows={3} disabled={locked} value={version.icp_summary} onChange={(event) => onChange({ icp_summary: event.target.value })} onBlur={onSave} />
          </Field>
        </div>
        <p className="mt-3 text-sm text-vice-text-muted">{[primary?.name || "Nog geen doelgroep", version.offering || "Aanbod onbekend", version.geography].filter(Boolean).join(" · ")}</p>
        <p className="mt-4 text-sm text-vice-text">{version.position_sentence || version.promise || "Positionering nog leeg"}</p>
        <CriterionList criteria={wb.criteria} locked={locked} onChange={(criteria) => onChange({}, criteria)} onSave={onSave} />
      </div>

      <details className="rounded-xl border border-vice-border p-4 print:hidden">
        <summary className="cursor-pointer text-sm font-medium">Kenmerken, voorwaarden en onderbouwing</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {([
            ["icp_sector", "Sector of activiteit"],
            ["icp_stage", "Bedrijfsfase"],
            ["icp_size", "Omvang, alleen als bekend"],
            ["icp_structure", "Structuur"],
            ["icp_tech", "Technologie"],
            ["icp_problem", "Probleem"],
            ["icp_need", "Zakelijke behoefte"],
            ["icp_outcome", "Gewenste uitkomst"],
            ["icp_trigger", "Kooptrigger"],
            ["icp_inaction", "Gevolg van niets doen"],
            ["icp_budget", "Budget, of leeg laten"],
            ["icp_capacity", "Klantcapaciteit"],
            ["icp_conditions", "Randvoorwaarden"],
            ["icp_timing", "Timing"],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input className={fieldClass} disabled={locked} value={version[key]} placeholder={key === "icp_budget" ? "Onbekend" : ""} onChange={(event) => onChange({ [key]: event.target.value })} onBlur={onSave} />
            </Field>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          <Field label="Aannames">
            <textarea className={fieldClass} rows={2} disabled={locked} value={version.assumptions} onChange={(event) => onChange({ assumptions: event.target.value })} onBlur={onSave} />
          </Field>
          <Field label="Open vragen">
            <textarea className={fieldClass} rows={2} disabled={locked} value={version.open_questions} onChange={(event) => onChange({ open_questions: event.target.value })} onBlur={onSave} />
          </Field>
          <Field label="Aanvaarde onzekerheid">
            <textarea className={fieldClass} rows={2} disabled={locked} value={version.accepted_uncertainty} onChange={(event) => onChange({ accepted_uncertainty: event.target.value })} onBlur={onSave} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-vice-text-muted">De doelgroep wijzig je in Targeting. Een lokale aanpassing hier maakt de keuze niet anders.</p>
      </details>

      {typeof proposal.icp_summary === "string" && proposal.icp_summary ? (
        <div className="rounded-xl border border-vice-border bg-vice-surface-muted p-4 text-sm print:hidden">
          <p className="font-medium">ICP-voorstel voor lege velden</p>
          <p className="mt-2">{String(proposal.icp_name)} — {String(proposal.icp_summary)}</p>
          <Button type="button" className="mt-3" variant="secondary" disabled={locked} onClick={onApply}>Neem lege velden over</Button>
        </div>
      ) : null}

      <ul className="space-y-2 print:hidden" aria-label="Kwaliteitscontrole">
        {checks.map((check) => (
          <li key={check.id} className="flex flex-wrap items-baseline gap-2 text-sm">
            <Chip tone={check.level === "ready" ? "green" : check.level === "attention" ? "amber" : "gold"}>{levelLabel[check.level]}</Chip>
            <span className="font-medium">{check.label}</span>
            <span className="text-vice-text-muted">{check.detail}</span>
          </li>
        ))}
      </ul>

      {confirming && !locked ? (
        <div className="rounded-xl border border-vice-border bg-vice-surface p-4 text-sm" role="region" aria-label="Bevestig goedkeuring">
          <p className="font-medium">Dit wordt goedgekeurd als versie {version.version_number}.</p>
          <p className="mt-2">{version.icp_name || "Naam nog leeg"} — {primary?.name || "geen doelgroep"}.</p>
          <p className="mt-2 text-vice-text-muted">Onzekerheden blijven zichtbaar: {checks.filter((check) => check.level === "attention").map((check) => check.label).join(", ") || "geen"}.</p>
          <Button type="button" className={`mt-3 ${goldButtonClass}`} disabled={blocked} onClick={onApprove}>ICP goedkeuren</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3 print:hidden">
        <Button type="button" variant="secondary" disabled={locked} onClick={onPropose}>Stel het ICP samen</Button>
        <Button type="button" variant="secondary" onClick={onExport}>Kopieer als tekst</Button>
        <Button type="button" variant="secondary" onClick={onPrint}>Exporteer via print</Button>
        {!locked ? <Button type="button" className={goldButtonClass} disabled={blocked} onClick={onAsk}>ICP goedkeuren</Button> : null}
        {locked && !version.published_at ? <Button type="button" variant="secondary" onClick={onPublish}>Publiceer naar klantdashboard</Button> : null}
        {locked && version.published_at ? <Button type="button" variant="secondary" onClick={onUnpublish}>Trek publicatie in</Button> : null}
        {locked ? <Button type="button" variant="secondary" onClick={onRevision}>Nieuwe conceptversie</Button> : null}
        <Button type="button" asChild className={goldButtonClass}>
          <Link href={`/klanten/${tenantId}/strategie/${PERSONA_ROUTE}`}>Naar persona’s →</Link>
        </Button>
      </div>
      <p className="text-sm text-vice-text-muted print:hidden">Persona’s en de klantreis gebruiken dit ICP{locked ? ` met versie ${version.version_number}` : ""}. Een concept-ICP mag al, goedkeuren van persona’s wacht tot dit ICP goedgekeurd is.</p>
    </section>
  );
}

function CriterionList({
  criteria,
  locked,
  onChange,
  onSave,
}: {
  criteria: StpCriterion[];
  locked: boolean;
  onChange: (criteria: StpCriterion[]) => void;
  onSave: () => void;
}) {
  const groups = STP_CRITERION_KINDS;
  return (
    <div className="mt-4 space-y-3">
      {groups.map((kind) => (
        <div key={kind}>
          <p className="text-xs font-medium text-vice-text-muted">{STP_CRITERION_LABELS[kind]}</p>
          <ul className="mt-1 space-y-2">
            {criteria.filter((item) => item.kind === kind).map((item) => (
              <li key={item.id || item.body}>
                <input
                  className={fieldClass}
                  disabled={locked}
                  value={item.body}
                  onChange={(event) => onChange(criteria.map((row) => row === item ? { ...row, body: event.target.value } : row))}
                  onBlur={onSave}
                />
              </li>
            ))}
          </ul>
          {!locked ? (
            <button
              type="button"
              className="mt-1 text-xs text-vice-text-muted hover:text-vice-text"
              onClick={() => onChange([...criteria, { id: `new-${kind}-${criteria.length}`, kind: kind as StpCriterionKind, body: "", sort_order: criteria.length }])}
            >
              + {STP_CRITERION_LABELS[kind]}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Sources({ catalogCount, version }: { catalogCount: number; version: StpWorkbench["version"] }) {
  const used = [
    version.pestel_version_id && "PESTEL",
    version.porter_version_id && "Porter",
    version.five_c_version_id && "5C",
    version.swot_version_id && "SWOT",
    version.vrio_version_id && "VRIO",
    version.bcg_version_id && "BCG",
    version.vc_version_id && "Waardeketen",
  ].filter(Boolean);
  return (
    <details className="mt-10 text-sm text-vice-text-muted print:hidden">
      <summary className="cursor-pointer">Waarom staat dit hier?</summary>
      <p className="mt-2">Voorstellen komen uit {catalogCount} bronnen van dit dossier: {used.join(", ") || "nog geen goedgekeurde analyse"}. Een eerdere analyse is geen bewijs op zich. Bedragen uit de waardeketen gaan niet naar het ICP.</p>
    </details>
  );
}

function SegmentDialog({
  segment,
  others,
  catalog,
  locked,
  onClose,
  onSave,
  onArchive,
  onMerge,
  onResolve,
}: {
  segment: StpSegment;
  others: StpSegment[];
  catalog: ReturnType<typeof buildStpCatalog>;
  locked: boolean;
  onClose: () => void;
  onSave: (segment: StpSegment) => void;
  onArchive: () => void;
  onMerge: (dropId: string) => void;
  onResolve: (accept: boolean) => void;
}) {
  const [draft, setDraft] = useState(segment);
  const [mergeId, setMergeId] = useState("");
  const other = others.find((item) => item.id === mergeId);
  const conflict = other && draft.need.trim() && other.need.trim() && draft.need.trim() !== other.need.trim();
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      className="w-[min(40rem,calc(100%-2rem))] rounded-xl border border-vice-border bg-vice-surface p-5 text-vice-text shadow-lg backdrop:bg-black/40"
      onClose={onClose}
      aria-labelledby="segment-title"
    >
      <h2 id="segment-title" className="text-lg font-medium">{draft.id ? "Segment" : "Nieuw segment"}</h2>
      {segment.ai_state === "proposed" ? (
        <div className="mt-3 rounded-lg bg-vice-surface-muted p-3 text-sm">
          <p>Er staat een AI-voorstel. Je bewerking blijft staan tot je het overneemt.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onResolve(true)}>Voorstel overnemen</Button>
            <Button type="button" variant="ghost" onClick={() => onResolve(false)}>Voorstel sluiten</Button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        <Field label="Naam"><input className={fieldClass} autoFocus disabled={locked} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Behoefte"><textarea className={fieldClass} rows={2} disabled={locked} value={draft.need} onChange={(event) => setDraft({ ...draft, need: event.target.value })} /></Field>
        <Field label="Korte beschrijving"><textarea className={fieldClass} rows={2} disabled={locked} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <Field label="Kenmerken"><textarea className={fieldClass} rows={2} disabled={locked} value={draft.traits} onChange={(event) => setDraft({ ...draft, traits: event.target.value })} /></Field>
        <Field label="Geografie"><input className={fieldClass} disabled={locked} value={draft.geography} onChange={(event) => setDraft({ ...draft, geography: event.target.value })} /></Field>
        <Field label="Kooptrigger"><input className={fieldClass} disabled={locked} value={draft.trigger_text} onChange={(event) => setDraft({ ...draft, trigger_text: event.target.value })} /></Field>
        <Field label="Passend aanbod"><input className={fieldClass} disabled={locked} value={draft.offering} onChange={(event) => setDraft({ ...draft, offering: event.target.value })} /></Field>
        <Field label="Selectiecriteria"><textarea className={fieldClass} rows={2} disabled={locked} value={draft.include_criteria} onChange={(event) => setDraft({ ...draft, include_criteria: event.target.value })} /></Field>
        <Field label="Uitsluitingscriteria"><textarea className={fieldClass} rows={2} disabled={locked} value={draft.exclude_criteria} onChange={(event) => setDraft({ ...draft, exclude_criteria: event.target.value })} /></Field>
        <Field label="Aanname"><textarea className={fieldClass} rows={2} disabled={locked} value={draft.assumptions} onChange={(event) => setDraft({ ...draft, assumptions: event.target.value })} /></Field>
        <Field label="Open vraag"><input className={fieldClass} disabled={locked} value={draft.open_question} onChange={(event) => setDraft({ ...draft, open_question: event.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={locked} checked={draft.hypothesis} onChange={(event) => setDraft({ ...draft, hypothesis: event.target.checked })} />
          Dit is een hypothese
        </label>
        <Field label="Bron toevoegen">
          <select
            className={fieldClass}
            disabled={locked}
            defaultValue=""
            onChange={(event) => {
              const source = catalog.find((item) => item.key === event.target.value);
              if (!source) return;
              const ref: StpRef = source.ref;
              setDraft({ ...draft, refs: [...draft.refs, ref] });
            }}
          >
            <option value="">Kies een bron uit dit dossier</option>
            {catalog.map((source) => <option key={source.key} value={source.key}>{source.ref.label}</option>)}
          </select>
        </Field>
        {draft.refs.length > 0 ? <ul className="text-xs text-vice-text-muted">{draft.refs.map((ref) => <li key={`${ref.ref_type}-${ref.ref_id}`}>{ref.label}</li>)}</ul> : null}
        {draft.id && others.length > 0 ? (
          <div className="space-y-2">
            <Field label="Samenvoegen met">
              <select className={fieldClass} value={mergeId} disabled={locked} onChange={(event) => setMergeId(event.target.value)}>
                <option value="">Kies een segment</option>
                {others.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            {other ? <p className="text-xs text-vice-text-muted">De naam van dit segment blijft. Beschrijvingen en bronnen worden samengevoegd.{conflict ? ` De behoeften verschillen: “${draft.need}” en “${other.need}”.` : ""}</p> : null}
            <Button type="button" variant="secondary" disabled={locked || !mergeId} onClick={() => onMerge(mergeId)}>Voeg samen</Button>
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" className={goldButtonClass} disabled={locked || draft.name.trim().length < 2} onClick={() => onSave(draft)}>Bewaar segment</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Sluit</Button>
        {draft.id ? <Button type="button" variant="danger" disabled={locked} onClick={onArchive}>Archiveer</Button> : null}
      </div>
    </dialog>
  );
}
