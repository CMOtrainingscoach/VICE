"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, fieldClass, goldButtonClass } from "@/components/stp/stp-ui";
import {
  DECISION_ROLE_LABELS,
  DECISION_ROLES,
  EVIDENCE_LABELS,
  PERSONA_FRAMEWORK_INDEX,
  PERSONA_STEP_LABELS,
  PERSONA_STEPS,
  PHASE_STARTERS,
  PORTRAIT_STATUS_LABELS,
  STP_ROUTE,
  type DecisionRole,
  type PersonaStep,
} from "@/lib/persona/constants";
import { activePersonas, approvalBlocked, personaChecks, publishBlocked } from "@/lib/persona/checks";
import { isUploadedPortrait, PERSONA_PHOTO_MAX_BYTES } from "@/lib/persona/photo";
import type { JourneyPhase, Persona, PersonaWorkbench } from "@/lib/persona/types";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { BRAND_ROUTE } from "@/lib/value-chain/constants";
import {
  applyJourneyProposalAction,
  approvePersonaAction,
  archivePersonaAction,
  archivePhaseAction,
  confirmJourneysAction,
  confirmPersonasAction,
  createPersonaRevisionAction,
  deriveDesiredJourneyAction,
  ensureJourneyAction,
  exportPersonaTextAction,
  failPersonaPortraitAction,
  loadPersonaWorkbenchAction,
  movePhaseAction,
  proposeJourneyAction,
  proposePersonasAction,
  publishPersonaAction,
  resolvePersonaProposalAction,
  savePersonaAction,
  savePersonaNotesAction,
  savePhaseAction,
  selectPersonaPortraitAction,
  setPersonaStepAction,
  startPersonaPortraitAction,
  unpublishPersonaAction,
  uploadPersonaPhotoAction,
} from "@/modules/persona/actions";

type SaveState = "saving" | "saved" | "unsaved" | "error";

export function PersonaWorkspace({ tenantId, tenantName, initial }: { tenantId: string; tenantName: string; initial: PersonaWorkbench }) {
  const [wb, setWb] = useState(initial);
  const [save, setSave] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState(initial.personas.find((persona) => !persona.archived_at)?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [phase, setPhase] = useState<JourneyPhase | null>(null);
  const version = wb.version;
  const locked = version.status === "approved";
  const step = version.current_step;
  const people = wb.personas.filter((persona) => !persona.archived_at);
  const selected = people.find((persona) => persona.id === selectedId) ?? people[0];
  const checks = personaChecks(wb);
  const pending = people.some((persona) => persona.portraits.some((portrait) => portrait.status === "queued" || portrait.status === "running"));

  async function reload(versionId = version.id) {
    const next = await loadPersonaWorkbenchAction(tenantId, versionId);
    if (!next.ok || !next.data) {
      setError(next.ok ? "Herladen mislukt." : next.error);
      setSave("error");
      return null;
    }
    setWb(next.data);
    setSave("saved");
    return next.data;
  }

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      void loadPersonaWorkbenchAction(tenantId, version.id).then((next) => {
        if (next.ok && next.data) {
          setWb(next.data);
          setSave("saved");
        }
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [pending, tenantId, version.id]);

  async function run(label: string, task: () => Promise<{ ok: boolean; error?: string; versionId?: string }>) {
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
      setError("De verbinding viel weg. Je tekst blijft staan.");
      setSave("error");
    } finally {
      setBusy("");
    }
  }

  async function reopenForEdit() {
    await run(version.published_at ? "Publicatie intrekken en bewerken" : "Bewerken hervatten", async () => {
      const opened = await unpublishPersonaAction(tenantId, { versionId: version.id });
      if (!opened.ok) return opened;
      const next = await loadPersonaWorkbenchAction(tenantId, version.id);
      if (!next.ok || !next.data) return { ok: false, error: next.ok ? "Herladen mislukt." : next.error };
      if (next.data.version.status === "approved") {
        return { ok: false, error: "De velden blijven dicht. Pas migratie 20260330133100 toe in de Supabase SQL-editor, na 20260330133000." };
      }
      return { ok: true };
    });
  }

  async function go(next: PersonaStep) {
    if (locked) {
      setWb((prev) => ({ ...prev, version: { ...prev.version, current_step: next } }));
      return;
    }
    await run("Stap openen", () => setPersonaStepAction(tenantId, { versionId: version.id, step: next }));
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10 print:max-w-none print:px-0">
      <header className="print:hidden">
        <p className="text-right text-xs text-vice-text-muted" aria-live="polite">{save === "saving" ? "Opslaan…" : save === "error" || save === "unsaved" ? "Niet opgeslagen" : "Opgeslagen"}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-vice-gold">{PERSONA_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · Persona&apos;s · {tenantName} · versie {version.version_number}</p>
        <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">{step === "basis" ? "Wie beslist er bij je ideale klant?" : step === "journey" ? "Hoe komt deze klant van behoefte naar samenwerking?" : step === "finish" ? "Klaar om je klant beter te begeleiden" : "Persona’s"}</h1>
        <ol className="mt-6 flex flex-wrap gap-2" aria-label="Stappen">
          {PERSONA_STEPS.map((item, index) => (
            <li key={item}>
              <button type="button" className={`rounded-full px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold ${item === step ? "bg-vice-text text-vice-bg" : "bg-vice-surface-muted text-vice-text-muted"}`} onClick={() => void go(item)}>
                {index + 1}. {PERSONA_STEP_LABELS[item]}
              </button>
            </li>
          ))}
        </ol>
      </header>
      {locked ? (
        <div className="mt-6 rounded-lg border border-vice-border bg-vice-surface p-4">
          <p className="text-sm font-medium">De velden zijn grijs omdat deze versie goedgekeurd is.</p>
          <p className="mt-1 text-sm text-vice-text-muted">{version.published_at ? "Trek de publicatie in. Daarna kun je de persona’s en de klantreis weer aanpassen. De klant ziet ze niet meer tot je opnieuw publiceert." : "De publicatie staat al uit. Hervat bewerken om de velden weer te openen. Daarna keur je opnieuw goed."}</p>
          <Button type="button" className={`mt-3 ${goldButtonClass}`} onClick={() => void reopenForEdit()}>{version.published_at ? "Trek publicatie in en bewerk" : "Hervat bewerken"}</Button>
        </div>
      ) : null}
      {version.needs_review ? <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">{version.review_note || "Opnieuw bekijken."} De vorige publicatie blijft staan.</p> : null}
      {version.version_number > 1 && !locked ? <p className="mt-4 text-sm text-vice-text-muted">Er loopt een herziening. De klant ziet de vorige publicatie tot je deze publiceert.</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200" role="alert">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-vice-text-muted">{notice}</p> : null}
      {busy ? <p className="mt-4 text-sm" aria-live="polite">{busy}</p> : null}

      <div className="mt-8">
        {step === "basis" ? (
          <Basis
            tenantId={tenantId}
            wb={wb}
            locked={locked}
            onGenerate={() => void run("Persona’s voorstellen vanuit het ICP", () => proposePersonasAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }))}
            onManual={() => setCreating(true)}
          />
        ) : null}
        {step === "personas" ? (
          <PersonaStepView
            wb={wb}
            people={people}
            selected={selected}
            locked={locked}
            onSelect={setSelectedId}
            onCreate={() => setCreating(true)}
            onChange={(personaId, patch) => {
              setWb((prev) => ({ ...prev, personas: prev.personas.map((persona) => persona.id === personaId ? { ...persona, ...patch } : persona) }));
              setSave("unsaved");
            }}
            onSave={(persona) => void run("Persona bewaren", () => savePersonaAction(tenantId, personaPayload(version.id, persona)))}
            onResolve={(personaId, accept) => void run(accept ? "Voorstel overnemen" : "Voorstel afwijzen", () => resolvePersonaProposalAction(tenantId, { personaId, accept }))}
            onArchive={(personaId) => void run("Persona archiveren", () => archivePersonaAction(tenantId, { personaId }))}
            onPortrait={(personaId, prompt) => void run("Portret in de wachtrij zetten", () => startPersonaPortraitAction(tenantId, { personaId, prompt }))}
            onUpload={(personaId, file) => {
              const body = new FormData();
              body.set("personaId", personaId);
              body.set("file", file);
              void run("Foto uploaden", () => uploadPersonaPhotoAction(tenantId, body));
            }}
            onSelectPortrait={(portraitId) => void run("Portret kiezen", () => selectPersonaPortraitAction(tenantId, { portraitId }))}
            onCancelPortrait={(portraitId) => void run("Portret annuleren", () => failPersonaPortraitAction(tenantId, { portraitId }))}
            onConfirm={() => void run("Persona’s bevestigen", () => confirmPersonasAction(tenantId, { versionId: version.id }))}
          />
        ) : null}
        {step === "journey" ? (
          <JourneyStep
            tenantId={tenantId}
            wb={wb}
            people={activePersonas(wb)}
            locked={locked}
            onOpen={setPhase}
            onKind={async (kind, primaryId) => {
              await run(kind === "desired" ? "Gewenste reis openen" : "Huidige reis openen", () => ensureJourneyAction(tenantId, { versionId: version.id, kind, primaryPersonaId: primaryId }));
            }}
            onPropose={(journeyId, kind, roleTitle) => void run("Klantreis voorstellen", () => proposeJourneyAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at, journeyId, kind, roleTitle }))}
            onApply={(journeyId, replace) => void run(replace ? "Fasen vervangen" : "Fasen toevoegen", () => applyJourneyProposalAction(tenantId, { journeyId, replace }))}
            onDerive={(personaId) => void run("Gewenste reis maken vanuit de huidige", () => deriveDesiredJourneyAction(tenantId, { versionId: version.id, personaId }))}
            onMove={(phaseId, direction) => void run("Fase verplaatsen", () => movePhaseAction(tenantId, { phaseId, direction }))}
            onArchive={(phaseId, restore) => void run(restore ? "Fase herstellen" : "Fase verwijderen", () => archivePhaseAction(tenantId, { phaseId, restore }))}
            onDuplicate={(item) => {
              const journey = wb.journeys.find((row) => row.phases.some((phase) => phase.id === item.id));
              if (!journey) return;
              void run("Fase dupliceren", () => savePhaseAction(tenantId, { ...phasePayload(journey.id, { ...item, name: `${item.name} (kopie)`.slice(0, 120) }), phaseId: null }));
            }}
            onStarter={async (journeyId) => {
              await run("Fasen als vertrekpunt zetten", async () => {
                for (const name of PHASE_STARTERS) {
                  const saved = await savePhaseAction(tenantId, emptyPhase(journeyId, name));
                  if (!saved.ok) return saved;
                }
                return { ok: true };
              });
            }}
            onConfirm={() => void run("Klantreis bevestigen", () => confirmJourneysAction(tenantId, { versionId: version.id }))}
          />
        ) : null}
        {step === "finish" ? (
          <Finish
            tenantId={tenantId}
            wb={wb}
            checks={checks}
            locked={locked}
            onNotes={(uncertainty, questions) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, accepted_uncertainty: uncertainty, open_questions: questions } }));
              setSave("unsaved");
            }}
            onSaveNotes={() => void run("Notities bewaren", () => savePersonaNotesAction(tenantId, { versionId: version.id, uncertainty: version.accepted_uncertainty, questions: version.open_questions }))}
            onApprove={() => void run("Goedkeuren", () => approvePersonaAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }))}
            onPublish={() => void run("Publiceren", () => publishPersonaAction(tenantId, { versionId: version.id }))}
            onUnpublish={() => void reopenForEdit()}
            onRevision={() => void run("Nieuwe conceptversie", async () => {
              const created = await createPersonaRevisionAction(tenantId, { versionId: version.id });
              if (!created.ok || !created.data) return { ok: false, error: created.ok ? "Geen nieuwe versie" : created.error };
              return { ok: true, versionId: created.data.versionId };
            })}
            onExport={async () => {
              const exported = await exportPersonaTextAction(tenantId, { versionId: version.id });
              if (!exported.ok || !exported.data) {
                setError(exported.ok ? "Export mislukt" : exported.error);
                return;
              }
              await navigator.clipboard.writeText(exported.data.text);
              setNotice(version.status === "approved" ? "Tekst gekopieerd." : "Concepttekst gekopieerd.");
            }}
            onPrint={() => window.print()}
          />
        ) : null}
      </div>

      {creating ? (
        <CreateDialog
          locked={locked}
          onClose={() => setCreating(false)}
          onSave={(draft) => void run("Persona aanmaken", async () => {
            const saved = await savePersonaAction(tenantId, { ...blankPayload(version.id), ...draft });
            setCreating(false);
            if (!saved.ok || !saved.data) return saved;
            await startPersonaPortraitAction(tenantId, { personaId: saved.data.personaId, prompt: "" });
            return { ok: true };
          })}
        />
      ) : null}
      {phase ? (
        <PhaseDialog
          key={phase.id}
          phase={phase}
          people={people}
          locked={locked}
          onClose={() => setPhase(null)}
          onSave={(draft) => {
            const journey = wb.journeys.find((item) => item.phases.some((row) => row.id === draft.id));
            if (!journey) return;
            setPhase(null);
            void run("Fase bewaren", () => savePhaseAction(tenantId, { ...phasePayload(journey.id, draft), phaseId: draft.id }));
          }}
        />
      ) : null}
    </div>
  );
}

function personaPayload(versionId: string, persona: Persona) {
  return {
    versionId,
    personaId: persona.id || null,
    roleTitle: persona.role_title,
    displayName: persona.display_name,
    summary: persona.summary,
    decisionRoles: persona.decision_roles,
    relevance: persona.relevance,
    goals: persona.goals,
    outcomes: persona.outcomes,
    responsibilities: persona.responsibilities,
    successCriteria: persona.success_criteria,
    pains: persona.pains,
    barriers: persona.barriers,
    risks: persona.risks,
    consequences: persona.consequences,
    triggers: persona.triggers,
    decisionCriteria: persona.decision_criteria,
    objections: persona.objections,
    infoNeeded: persona.info_needed,
    otherRoles: persona.other_roles,
    touchpoints: persona.touchpoints,
    questions: persona.questions,
    arguments: persona.arguments,
    proofNeeded: persona.proof_needed,
    channels: persona.channels,
    assumptions: persona.assumptions,
    openQuestion: persona.open_question,
    conflictNote: persona.conflict_note,
    hypothesis: persona.hypothesis,
    evidenceLevel: persona.evidence_level,
    active: persona.active,
    audienceRank: persona.audience_rank,
  };
}

function blankPayload(versionId: string) {
  return personaPayload(versionId, {
    id: "", role_title: "Nieuwe rol", display_name: "", summary: "", decision_roles: [], relevance: "", goals: "", outcomes: "",
    responsibilities: "", success_criteria: "", pains: "", barriers: "", risks: "", consequences: "", triggers: "", decision_criteria: "",
    objections: "", info_needed: "", other_roles: "", touchpoints: "", questions: "", arguments: "", proof_needed: "", channels: "",
    assumptions: "", open_question: "", conflict_note: "", hypothesis: true, evidence_level: "hypothesis", active: true, audience_rank: "secondary", manual_lock: true,
    origin: "manual", ai_state: "none", ai_payload: {}, overlap_note: "", illustration_prompt: "", selected_portrait_id: null,
    archived_at: null, sort_order: 0, portraits: [], refs: [],
  });
}

function emptyPhase(journeyId: string, name: string) {
  return {
    journeyId, phaseId: null, name, goal: "", actions: "", questions: "", infoNeed: "", decisionCriteria: "", barriers: "",
    nextStep: "", touchpoints: "", channels: "", involvedPersonaIds: [] as string[], companySide: "", contentNeeded: "", assumption: "Vertrekpunt, nog niet onderbouwd.",
    openQuestion: "", emotion: "", improvement: "", proposedAction: "", contribution: "", ownerName: "", priority: "unknown" as const, hypothesis: true,
  };
}

function phasePayload(journeyId: string, phase: JourneyPhase) {
  return {
    journeyId, phaseId: phase.id, name: phase.name, goal: phase.goal, actions: phase.actions, questions: phase.questions,
    infoNeed: phase.info_need, decisionCriteria: phase.decision_criteria, barriers: phase.barriers, nextStep: phase.next_step,
    touchpoints: phase.touchpoints, channels: phase.channels, involvedPersonaIds: phase.involved_persona_ids, companySide: phase.company_side, contentNeeded: phase.content_needed,
    assumption: phase.assumption, openQuestion: phase.open_question, emotion: phase.emotion, improvement: phase.improvement,
    proposedAction: phase.proposed_action, contribution: phase.contribution, ownerName: phase.owner_name, priority: phase.priority, hypothesis: phase.hypothesis,
  };
}

function Basis({ tenantId, wb, locked, onGenerate, onManual }: { tenantId: string; wb: PersonaWorkbench; locked: boolean; onGenerate: () => void; onManual: () => void }) {
  const icp = wb.icp;
  return (
    <section className="space-y-6">
      <p className="max-w-prose text-sm text-vice-text-muted">Bouw verder op je goedgekeurde ICP. Een ICP beschrijft bedrijven, niet hoe een persoon beslist.</p>
      {icp.present ? (
        <article className="rounded-xl border border-vice-border bg-vice-surface p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-vice-gold">{icp.approved ? "Goedgekeurd ICP" : "Concept-ICP"} · versie {icp.version_number}</p>
          <h2 className="mt-2 text-lg font-medium">{icp.name || "Naam nog leeg"}</h2>
          <p className="mt-2 text-sm text-vice-text">{icp.summary || "Nog geen beschrijving."}</p>
          <p className="mt-3 text-sm text-vice-text-muted">{[icp.offering, icp.geography, icp.sector, icp.need].filter(Boolean).join(" · ")}</p>
          <Link href={`/klanten/${tenantId}/strategie/${STP_ROUTE}`} className="mt-4 inline-block text-sm text-vice-gold">Bekijk ICP</Link>
        </article>
      ) : (
        <p className="text-sm">Er is nog geen ICP. <Link className="text-vice-gold" href={`/klanten/${tenantId}/strategie/${STP_ROUTE}`}>Ga naar STP</Link>.</p>
      )}
      {icp.present && !icp.approved ? <p className="text-sm text-amber-800 dark:text-amber-200">Je mag een concept maken. Goedkeuren kan pas als het ICP goedgekeurd is.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-vice-border bg-vice-surface p-5">
          <h2 className="font-medium">Voorstellen met AI</h2>
          <p className="mt-2 text-sm text-vice-text-muted">Gebruik ICP, meetings en documenten. Ontbrekende kennis blijft een hypothese.</p>
          <Button type="button" className={`mt-4 ${goldButtonClass}`} disabled={locked || !icp.present} onClick={onGenerate}>Genereer persona’s</Button>
        </article>
        <article className="rounded-xl border border-vice-border bg-vice-surface p-5">
          <h2 className="font-medium">Zelf beginnen</h2>
          <p className="mt-2 text-sm text-vice-text-muted">Vier vragen, daarna dezelfde editor. Het portret volgt vanzelf.</p>
          <Button type="button" variant="secondary" className="mt-4" disabled={locked} onClick={onManual}>Maak manueel</Button>
        </article>
      </div>
    </section>
  );
}

function Portrait({ persona, locked, onPortrait, onUpload, onSelect, onCancel }: { persona: Persona; locked: boolean; onPortrait: (prompt: string) => void; onUpload: (file: File) => void; onSelect: (id: string) => void; onCancel: (id: string) => void }) {
  const current = persona.portraits.find((portrait) => portrait.id === persona.selected_portrait_id && portrait.status === "ready");
  const pending = persona.portraits.find((portrait) => portrait.status === "queued" || portrait.status === "running");
  const failed = persona.portraits.find((portrait) => portrait.status === "failed");
  const ready = persona.portraits.filter((portrait) => portrait.status === "ready");
  const uploaded = isUploadedPortrait(current?.provider);
  const hasImage = Boolean(current?.storage_path);
  const [prompt, setPrompt] = useState(persona.illustration_prompt);
  const [open, setOpen] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const alt = uploaded
    ? `Eigen foto bij de rol ${persona.role_title}.`
    : `AI-visualisatie van de rol ${persona.role_title}. Fictief portret ter illustratie.`;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        {current?.url ? (
          <button type="button" onClick={() => setOpen(true)} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold">
            {/* Privé signed URL; niet via de image-optimizer sturen. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={alt} className="h-28 w-28 rounded-xl object-cover" />
          </button>
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-vice-surface-muted text-lg font-medium text-vice-text-muted" aria-hidden>{initials(persona.role_title)}</div>
        )}
        <div className="space-y-2 text-sm">
          <Chip tone={uploaded ? "neutral" : hasImage ? "gold" : "neutral"}>{uploaded ? "Eigen foto" : hasImage ? "AI-visualisatie" : "Nog geen foto"}</Chip>
          <p className="text-vice-text-muted">{uploaded ? "Foto die je zelf bij deze rol hebt gezet." : hasImage ? "Fictief portret ter illustratie van deze rol. Geen feit over de doelgroep." : "Upload een eigen foto, of laat een illustratie genereren."}</p>
          {pending ? <p>{PORTRAIT_STATUS_LABELS[pending.status]}. Je kunt verder werken.</p> : null}
          {failed ? <p className="text-red-700 dark:text-red-300">{failed.error_message || "Mislukt."} <button type="button" className="underline" onClick={() => onPortrait(prompt)}>Opnieuw</button></p> : null}
          {pending ? <button type="button" className="underline" onClick={() => onCancel(pending.id)}>Annuleer en probeer opnieuw</button> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          disabled={locked}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > PERSONA_PHOTO_MAX_BYTES) {
              setFileError("De foto is groter dan 4 MB.");
              return;
            }
            setFileError("");
            onUpload(file);
          }}
        />
        <Button type="button" variant="secondary" disabled={locked} onClick={() => fileRef.current?.click()}>Upload een foto</Button>
        <Button type="button" variant="secondary" disabled={locked || Boolean(pending)} onClick={() => onPortrait(prompt)}>{current ? "Genereer een ander portret" : "Genereer een portret"}</Button>
      </div>
      <p className="text-xs text-vice-text-muted">JPEG, PNG of WebP, tot 4 MB. Een geüploade foto vervangt de huidige keuze. Eerdere varianten blijven beschikbaar.</p>
      {fileError ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">{fileError}</p> : null}
      <label className="block text-xs text-vice-text-muted">Visuele omschrijving, alleen voor een gegenereerd portret
        <textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      {ready.length > 1 ? (
        <ul className="flex flex-wrap gap-3">
          {ready.map((portrait) => {
            const inUse = portrait.id === current?.id;
            const label = inUse ? "In gebruik" : isUploadedPortrait(portrait.provider) ? "Eigen foto" : "AI-visualisatie";
            return (
              <li key={portrait.id}>
                <button type="button" className="block text-left text-xs disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold" disabled={locked || inUse} onClick={() => onSelect(portrait.id)} aria-label={inUse ? `${label}, huidige foto` : `Gebruik deze ${label.toLowerCase()}`}>
                  {portrait.url ? (
                    <>
                      {/* Privé signed URL; niet via de image-optimizer sturen. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={portrait.url} alt="" className={`h-16 w-16 rounded-lg object-cover ${inUse ? "ring-2 ring-vice-gold" : ""}`} />
                    </>
                  ) : null}
                  <span className="mt-1 block underline">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {open && current?.url ? (
        <dialog open className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-vice-surface p-4 shadow-lg" aria-label={uploaded ? "Vergrote foto" : "Vergrote visualisatie"} onClose={() => setOpen(false)}>
          {/* Privé signed URL; niet via de image-optimizer sturen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={alt} className="max-h-[70vh] rounded-lg" />
          <Button type="button" className="mt-3" variant="ghost" onClick={() => setOpen(false)}>Sluit</Button>
        </dialog>
      ) : null}
    </div>
  );
}

function initials(role: string): string {
  const parts = role.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

const PERSONA_FIELDS = [
  ["goals", "Zakelijke doelen"],
  ["pains", "Pijnpunten"],
  ["relevance", "Relevantie voor het ICP"],
  ["triggers", "Kooptriggers"],
  ["objections", "Bezwaren"],
  ["questions", "Vragen van deze rol"],
  ["channels", "Kanalen, alleen als onderbouwd"],
  ["assumptions", "Hypotheses"],
  ["open_question", "Open vraag"],
] as const;

function PersonaStepView(props: {
  wb: PersonaWorkbench;
  people: Persona[];
  selected?: Persona;
  locked: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onChange: (id: string, patch: Partial<Persona>) => void;
  onSave: (persona: Persona) => void;
  onResolve: (id: string, accept: boolean) => void;
  onArchive: (id: string) => void;
  onPortrait: (id: string, prompt: string) => void;
  onUpload: (id: string, file: File) => void;
  onSelectPortrait: (id: string) => void;
  onCancelPortrait: (id: string) => void;
  onConfirm: () => void;
}) {
  const persona = props.selected;
  const shared = persona ? props.people.filter((item) => item.id !== persona.id && item.decision_roles.some((role) => persona.decision_roles.includes(role))) : [];
  const otherActive = props.people.filter((item) => item.id !== persona?.id && item.active && item.ai_state !== "proposed");
  function statusLabel(item: Persona): string {
    if (item.ai_state === "proposed") return "Voorstel";
    if (!item.active) return "Niet in de set";
    return item.audience_rank === "primary" ? "Primair" : "Secundair";
  }
  return (
    <section className="space-y-4">
      <p className="max-w-prose text-sm text-vice-text-muted">Kies links een persona en pas de tekst aan. Zet rollen in de set of eruit, maak er één primair, of archiveer een rol die je niet gebruikt.</p>
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="space-y-2">
        <Button type="button" className={`w-full ${goldButtonClass}`} disabled={props.locked} onClick={props.onCreate}>Nieuwe persona</Button>
        <ul className="space-y-2">
          {props.people.map((item) => (
            <li key={item.id} className={`rounded-xl border px-3 py-2 ${item.id === persona?.id ? "border-vice-gold bg-vice-surface" : "border-vice-border bg-vice-surface"}`}>
              <button type="button" className="w-full text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold" onClick={() => props.onSelect(item.id)}>
                <span className="block font-medium">{item.role_title}</span>
                <span className="text-vice-text-muted">{statusLabel(item)}</span>
              </button>
              {item.ai_state !== "proposed" && !item.active ? (
                <button type="button" className="mt-2 text-sm font-medium text-vice-gold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold disabled:opacity-50" disabled={props.locked} onClick={() => { props.onSelect(item.id); props.onSave({ ...item, active: true }); }}>Maak actief</button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {persona ? (
        <article className="space-y-4 rounded-xl border border-vice-border bg-vice-surface p-5">
          <header className="space-y-1">
            <h2 className="text-lg font-medium">Bewerk {persona.role_title}</h2>
            <p className="text-sm text-vice-text-muted">De velden hieronder zijn vrij te wijzigen. Een veld wordt bewaard als je het verlaat.</p>
          </header>
          {persona.ai_state === "proposed" ? (
            <div className="rounded-lg border border-vice-border bg-vice-surface-muted p-4">
              <p className="text-sm font-medium">Dit is nog een voorstel.</p>
              <p className="mt-1 text-sm text-vice-text-muted">Accepteer het om het in de set te zetten, of wijs het af.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" className={goldButtonClass} disabled={props.locked} onClick={() => props.onResolve(persona.id, true)}>Accepteer in de set</Button>
                <Button type="button" variant="secondary" disabled={props.locked} onClick={() => props.onResolve(persona.id, false)}>Wijs af</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-vice-border p-4">
              <p className="text-sm font-medium">{statusLabel(persona)}</p>
              {!persona.active ? (
                <>
                  <p className="mt-1 text-sm text-vice-text-muted">Deze rol telt nog niet mee. De tekst kun je wel al aanpassen.</p>
                  <Button type="button" className={`mt-3 ${goldButtonClass}`} disabled={props.locked} onClick={() => props.onSave({ ...persona, active: true })}>Maak actief</Button>
                </>
              ) : persona.audience_rank === "primary" ? (
                <>
                  <p className="mt-1 text-sm text-vice-text-muted">Dit is de hoofdpersona. {otherActive.length > 0 ? "Maak een andere rol primair als je deze secundair wilt." : "Voeg een andere actieve persona toe als je deze niet langer primair wilt."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {otherActive.map((item) => (
                      <Button key={item.id} type="button" variant="secondary" disabled={props.locked} onClick={() => props.onSave({ ...item, active: true, audience_rank: "primary" })}>Maak {item.role_title} primair</Button>
                    ))}
                    <Button type="button" variant="secondary" disabled={props.locked} onClick={() => props.onSave({ ...persona, active: false, audience_rank: "secondary" })}>Zet buiten de set</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-vice-text-muted">Deze rol telt mee, naast de primaire persona. Ze krijgt een eigen klantreis.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" className={goldButtonClass} disabled={props.locked} onClick={() => props.onSave({ ...persona, active: true, audience_rank: "primary" })}>Maak primair</Button>
                    <Button type="button" variant="secondary" disabled={props.locked} onClick={() => props.onSave({ ...persona, active: false, audience_rank: "secondary" })}>Zet buiten de set</Button>
                  </div>
                </>
              )}
            </div>
          )}
          <Portrait key={persona.id} persona={persona} locked={props.locked} onPortrait={(prompt) => props.onPortrait(persona.id, prompt)} onUpload={(file) => props.onUpload(persona.id, file)} onSelect={props.onSelectPortrait} onCancel={props.onCancelPortrait} />
          <label className="block text-xs text-vice-text-muted">Functierol
            <input className={`${fieldClass} mt-1`} disabled={props.locked} value={persona.role_title} onChange={(event) => props.onChange(persona.id, { role_title: event.target.value })} onBlur={(event) => props.onSave({ ...persona, role_title: event.target.value })} />
          </label>
          <label className="block text-xs text-vice-text-muted">Korte samenvatting
            <textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={persona.summary} onChange={(event) => props.onChange(persona.id, { summary: event.target.value })} onBlur={(event) => props.onSave({ ...persona, summary: event.target.value })} />
          </label>
          <fieldset className="flex flex-wrap gap-2" disabled={props.locked}>
            <legend className="mb-2 text-xs text-vice-text-muted">Rol in de aankoop</legend>
            {DECISION_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={persona.decision_roles.includes(role)} onChange={(event) => {
                  const decision_roles = event.target.checked ? [...persona.decision_roles, role] : persona.decision_roles.filter((item) => item !== role);
                  props.onChange(persona.id, { decision_roles });
                  props.onSave({ ...persona, decision_roles });
                }} />
                {DECISION_ROLE_LABELS[role as DecisionRole]}
              </label>
            ))}
          </fieldset>
          {shared.length > 0 ? <p className="text-sm text-vice-text-muted">Overlap met {shared.map((item) => item.role_title).join(", ")}. Samenvoegen gebeurt niet vanzelf: archiveer er een of houd ze apart.</p> : null}
          <details>
            <summary className="cursor-pointer text-sm">Doelen, problemen en koopgedrag</summary>
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-vice-text-muted">Optionele fictieve roepnaam
                <input className={`${fieldClass} mt-1`} disabled={props.locked} value={persona.display_name} onChange={(event) => props.onChange(persona.id, { display_name: event.target.value })} onBlur={(event) => props.onSave({ ...persona, display_name: event.target.value })} />
              </label>
              {PERSONA_FIELDS.map(([key, label]) => (
                <label key={key} className="block text-xs text-vice-text-muted">{label}
                  <textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={persona[key]} onChange={(event) => props.onChange(persona.id, { [key]: event.target.value })} onBlur={(event) => props.onSave({ ...persona, [key]: event.target.value })} />
                </label>
              ))}
              <p className="text-xs text-vice-text-muted">{EVIDENCE_LABELS[persona.evidence_level]}. Een leeg kanaal blijft onbekend.</p>
              <label className="block text-xs text-vice-text-muted">Onderbouwing
                <select className={`${fieldClass} mt-1`} disabled={props.locked} value={persona.evidence_level} onChange={(event) => {
                  const evidence_level = event.target.value as Persona["evidence_level"];
                  props.onChange(persona.id, { evidence_level });
                  props.onSave({ ...persona, evidence_level });
                }}>
                  {(Object.keys(EVIDENCE_LABELS) as Persona["evidence_level"][]).map((level) => <option key={level} value={level}>{EVIDENCE_LABELS[level]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={props.locked} checked={persona.hypothesis} onChange={(event) => { props.onChange(persona.id, { hypothesis: event.target.checked }); props.onSave({ ...persona, hypothesis: event.target.checked }); }} />Hypothese</label>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-vice-border pt-4">
            <Button type="button" variant="secondary" disabled={props.locked} onClick={() => props.onArchive(persona.id)}>Archiveer deze persona</Button>
            <Button type="button" className={goldButtonClass} disabled={props.locked} onClick={props.onConfirm}>Bevestig persona’s</Button>
          </div>
          <p className="text-xs text-vice-text-muted">Bevestigen zet de set vast en opent de klantreis. Archiveren haalt de rol en haar klantreis weg. Je kunt daarna nog terug.</p>
        </article>
      ) : (
        <div className="rounded-xl border border-vice-border bg-vice-surface p-5">
          <p className="text-sm">Nog geen persona.</p>
          <Button type="button" className={`mt-3 ${goldButtonClass}`} disabled={props.locked} onClick={props.onCreate}>Nieuwe persona</Button>
        </div>
      )}
      </div>
    </section>
  );
}

function JourneyStep(props: {
  tenantId: string;
  wb: PersonaWorkbench;
  people: Persona[];
  locked: boolean;
  onOpen: (phase: JourneyPhase) => void;
  onKind: (kind: "current" | "desired", primaryId: string | null) => void;
  onPropose: (journeyId: string, kind: "current" | "desired", roleTitle: string) => void;
  onApply: (journeyId: string, replace: boolean) => void;
  onDerive: (personaId: string) => void;
  onMove: (phaseId: string, direction: -1 | 1) => void;
  onArchive: (phaseId: string, restore: boolean) => void;
  onDuplicate: (phase: JourneyPhase) => void;
  onStarter: (journeyId: string) => void;
  onConfirm: () => void;
}) {
  const [kind, setKind] = useState<"current" | "desired">("current");
  const [personaId, setPersonaId] = useState(props.people.find((persona) => persona.audience_rank === "primary")?.id ?? props.people[0]?.id ?? "");
  const selected = props.people.find((persona) => persona.id === personaId) ?? props.people.find((persona) => persona.audience_rank === "primary") ?? props.people[0];
  const journey = props.wb.journeys.find((item) => item.kind === kind && !item.archived_at && item.primary_persona_id === selected?.id);
  const phases = (journey?.phases ?? []).filter((item) => !item.archived_at);
  const archived = (journey?.phases ?? []).filter((item) => item.archived_at);
  const proposal = Array.isArray(journey?.ai_proposal?.phases) ? journey.ai_proposal.phases : [];
  return (
    <section className="space-y-5">
      <p className="max-w-prose text-sm text-vice-text-muted">Elke persona heeft een eigen reis. Huidige reis: wat we weten of veronderstellen. Gewenste reis: hoe we het willen verbeteren. Die is nog niet gerealiseerd.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Persona voor deze klantreis">
        {props.people.map((persona) => (
          <button key={persona.id} type="button" className={`rounded-full px-3 py-1 text-sm ${selected?.id === persona.id ? "bg-vice-text text-vice-bg" : "bg-vice-surface-muted"}`} onClick={() => setPersonaId(persona.id)}>
            {persona.audience_rank === "primary" ? "Primair · " : "Secundair · "}{persona.role_title}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["current", "desired"] as const).map((item) => (
          <button key={item} type="button" className={`rounded-full px-3 py-1 text-sm ${kind === item && journey ? "bg-vice-text text-vice-bg" : "bg-vice-surface-muted"}`} onClick={() => { setKind(item); props.onKind(item, selected?.id ?? null); }}>{item === "current" ? "Huidige reis" : "Gewenste reis"}</button>
        ))}
      </div>
      {!selected ? <p className="text-sm">Bevestig eerst een persona.</p> : !journey ? <p className="text-sm text-vice-text-muted">Open de {kind === "desired" ? "gewenste" : "huidige"} reis van {selected.role_title}. Die blijft van deze persona.</p> : <p className="text-sm">Klantreis van {selected.audience_rank === "primary" ? "de primaire" : "de secundaire"} persona {selected.role_title}.</p>}
      <div className="flex gap-3 overflow-x-auto pb-2 md:flex-row flex-col">
        {phases.map((item, index) => (
          <article key={item.id} className="min-w-52 rounded-xl border border-vice-border bg-vice-surface p-4">
            <button type="button" className="text-left" onClick={() => props.onOpen(item)}>
              <p className="text-xs text-vice-text-muted">{index + 1}</p>
              <h3 className="font-medium">{item.name}</h3>
              <p className="mt-2 text-sm text-vice-text-muted">{item.goal || "Doel nog leeg"}</p>
              {item.barriers ? <p className="mt-2 text-xs">Drempel: {item.barriers}</p> : null}
              {item.hypothesis ? <Chip tone="amber">Hypothese</Chip> : null}
            </button>
            <div className="mt-3 flex gap-2 text-xs">
              <button type="button" disabled={props.locked} onClick={() => props.onMove(item.id, -1)}>Eerder</button>
              <button type="button" disabled={props.locked} onClick={() => props.onMove(item.id, 1)}>Later</button>
              <button type="button" disabled={props.locked} onClick={() => props.onDuplicate(item)}>Kopie</button>
              <button type="button" disabled={props.locked} onClick={() => props.onArchive(item.id, false)}>Weg</button>
            </div>
          </article>
        ))}
      </div>
      {proposal.length > 0 ? (
        <div className="rounded-xl border border-vice-border bg-vice-surface-muted p-4 text-sm">
          <p className="font-medium">Voorstel, nog niet toegepast</p>
          <ul className="mt-2">{proposal.map((item) => <li key={String(item.name)}>{String(item.name)} — {String(item.goal || "")}</li>)}</ul>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="secondary" disabled={props.locked || !journey} onClick={() => journey && props.onApply(journey.id, false)}>Voeg toe als de reis leeg is</Button>
            <Button type="button" variant="ghost" disabled={props.locked || !journey} onClick={() => journey && props.onApply(journey.id, true)}>Vervang mijn fasen</Button>
          </div>
        </div>
      ) : null}
      {archived.length > 0 ? <button type="button" className="text-xs underline" onClick={() => props.onArchive(archived[0].id, true)}>Herstel laatst verwijderde fase</button> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="secondary" disabled={props.locked || !journey || !selected} onClick={() => journey && selected && props.onPropose(journey.id, kind, selected.role_title)}>Stel klantreis voor met AI</Button>
        <Button type="button" variant="secondary" disabled={props.locked || !journey} onClick={() => journey && props.onStarter(journey.id)}>Bouw met vijf fasen</Button>
        {kind === "current" ? <Button type="button" variant="secondary" disabled={props.locked || !selected} onClick={() => selected && props.onDerive(selected.id)}>Maak gewenste reis</Button> : null}
        <Button type="button" className={goldButtonClass} disabled={props.locked} onClick={props.onConfirm}>Bevestig klantreis</Button>
        <BrandContinue tenantId={props.tenantId} ready={props.wb.version.personas_confirmed && props.wb.version.journeys_confirmed} />
      </div>
    </section>
  );
}

function Finish(props: {
  tenantId: string;
  wb: PersonaWorkbench;
  checks: ReturnType<typeof personaChecks>;
  locked: boolean;
  onNotes: (uncertainty: string, questions: string) => void;
  onSaveNotes: () => void;
  onApprove: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onRevision: () => void;
  onExport: () => void;
  onPrint: () => void;
}) {
  const blocked = approvalBlocked(props.checks);
  const labels = { ready: "Gereed", attention: "Aandachtspunt", block: "Blokkeert" } as const;
  return (
    <section className="space-y-5" id="persona-print">
      {props.locked ? <h2 className="text-xl font-semibold">De persona’s en de klantreis zijn vastgelegd.</h2> : null}
      {props.locked && !props.wb.version.published_at && publishBlocked(props.wb) ? <p className="text-sm text-vice-text-muted">Publicatie wacht op een gekozen portret voor elke actieve persona. Het concept blijft bruikbaar.</p> : null}
      <ul className="space-y-2">
        {props.checks.map((check) => (
          <li key={check.id} className="flex flex-wrap gap-2 text-sm">
            <Chip tone={check.level === "ready" ? "green" : check.level === "attention" ? "amber" : "gold"}>{labels[check.level]}</Chip>
            <span className="font-medium">{check.label}</span>
            <span className="text-vice-text-muted">{check.detail}</span>
          </li>
        ))}
      </ul>
      <label className="block text-xs text-vice-text-muted">Aanvaarde onzekerheid
        <textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={props.wb.version.accepted_uncertainty} onChange={(event) => props.onNotes(event.target.value, props.wb.version.open_questions)} onBlur={props.onSaveNotes} />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button type="button" variant="secondary" onClick={props.onExport}>Kopieer als tekst</Button>
        <Button type="button" variant="secondary" onClick={props.onPrint}>Exporteer via print</Button>
        {!props.locked ? <Button type="button" className={goldButtonClass} disabled={blocked} onClick={props.onApprove}>Goedkeuren</Button> : null}
        {props.locked && !props.wb.version.published_at ? <Button type="button" className={goldButtonClass} disabled={publishBlocked(props.wb)} onClick={props.onPublish}>Publiceer naar klantdashboard</Button> : null}
        {props.locked && props.wb.version.published_at ? <Button type="button" variant="secondary" onClick={props.onUnpublish}>Trek publicatie in en bewerk</Button> : null}
        {props.locked && !props.wb.version.published_at ? <Button type="button" variant="secondary" onClick={props.onUnpublish}>Hervat bewerken</Button> : null}
        {props.locked ? <Button type="button" variant="secondary" onClick={props.onRevision}>Nieuwe conceptversie</Button> : null}
        <BrandContinue tenantId={props.tenantId} ready={props.wb.version.personas_confirmed && props.wb.version.journeys_confirmed} />
      </div>
    </section>
  );
}

function BrandContinue({ tenantId, ready }: { tenantId: string; ready: boolean }) {
  if (ready) {
    return (
      <Button type="button" asChild className={`ml-auto ${goldButtonClass}`}>
        <Link href={`/klanten/${tenantId}/strategie/${BRAND_ROUTE}`}>Naar brand audit →</Link>
      </Button>
    );
  }
  return <Button type="button" className="ml-auto" variant="secondary" disabled title="Bevestig eerst de persona’s en de klantreis.">Naar brand audit →</Button>;
}

function CreateDialog({ locked, onClose, onSave }: { locked: boolean; onClose: () => void; onSave: (draft: { roleTitle: string; decisionRoles: DecisionRole[]; goals: string; pains: string }) => void }) {
  const [roleTitle, setRoleTitle] = useState("");
  const [role, setRole] = useState<DecisionRole>("decider");
  const [goals, setGoals] = useState("");
  const [pains, setPains] = useState("");
  return (
    <dialog open className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-vice-border bg-vice-surface p-5 shadow-lg" aria-labelledby="new-persona">
      <h2 id="new-persona" className="text-lg font-medium">Nieuwe persona</h2>
      <div className="mt-4 space-y-3">
        <label className="block text-xs">Functierol<input className={`${fieldClass} mt-1`} value={roleTitle} disabled={locked} onChange={(event) => setRoleTitle(event.target.value)} /></label>
        <label className="block text-xs">Rol in de aankoop
          <select className={`${fieldClass} mt-1`} value={role} disabled={locked} onChange={(event) => setRole(event.target.value as DecisionRole)}>
            {DECISION_ROLES.map((item) => <option key={item} value={item}>{DECISION_ROLE_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="block text-xs">Belangrijkste doel<textarea className={`${fieldClass} mt-1`} rows={2} value={goals} disabled={locked} onChange={(event) => setGoals(event.target.value)} /></label>
        <label className="block text-xs">Belangrijkste probleem<textarea className={`${fieldClass} mt-1`} rows={2} value={pains} disabled={locked} onChange={(event) => setPains(event.target.value)} /></label>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" className={goldButtonClass} disabled={locked || roleTitle.trim().length < 2} onClick={() => onSave({ roleTitle, decisionRoles: [role], goals, pains })}>Maak persona</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Sluit</Button>
      </div>
    </dialog>
  );
}

function PhaseDialog({ phase, people, locked, onClose, onSave }: { phase: JourneyPhase; people: Persona[]; locked: boolean; onClose: () => void; onSave: (phase: JourneyPhase) => void }) {
  const [draft, setDraft] = useState(phase);
  return (
    <dialog open className="fixed left-1/2 top-1/2 z-50 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-vice-border bg-vice-surface p-5 shadow-lg" aria-labelledby="phase-title">
      <h2 id="phase-title" className="text-lg font-medium">Fase</h2>
      <div className="mt-4 space-y-3">
        <label className="block text-xs">Naam<input className={`${fieldClass} mt-1`} disabled={locked} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="block text-xs">Klantdoel<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /></label>
        <label className="block text-xs">Vraag<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.questions} onChange={(event) => setDraft({ ...draft, questions: event.target.value })} /></label>
        <label className="block text-xs">Drempel<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.barriers} onChange={(event) => setDraft({ ...draft, barriers: event.target.value })} /></label>
        <fieldset className="space-y-1" disabled={locked}>
          <legend className="text-xs text-vice-text-muted">Andere betrokken persona’s</legend>
          {people.filter((persona) => !persona.archived_at).map((persona) => (
            <label key={persona.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.involved_persona_ids.includes(persona.id)} onChange={(event) => {
                const involved_persona_ids = event.target.checked
                  ? [...draft.involved_persona_ids, persona.id]
                  : draft.involved_persona_ids.filter((id) => id !== persona.id);
                setDraft({ ...draft, involved_persona_ids });
              }} />
              {persona.role_title}
            </label>
          ))}
        </fieldset>
        <label className="block text-xs">Verbeterkans, alleen voor de gewenste richting<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.improvement} onChange={(event) => setDraft({ ...draft, improvement: event.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={draft.hypothesis} onChange={(event) => setDraft({ ...draft, hypothesis: event.target.checked })} />Hypothese</label>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" className={goldButtonClass} disabled={locked || draft.name.trim().length < 2} onClick={() => onSave(draft)}>Bewaar fase</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Sluit</Button>
      </div>
    </dialog>
  );
}
