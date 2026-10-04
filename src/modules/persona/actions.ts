"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { PERSONA_ROUTE } from "@/lib/persona/constants";
import { proposeJourney, proposePersonas } from "@/lib/persona/persona-ai";
import { portraitDailyLimit, renderPortrait } from "@/lib/persona/portrait";
import type { Journey, JourneyPhase, Persona, PersonaPortrait, PersonaPublished, PersonaRef, PersonaWorkbench } from "@/lib/persona/types";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STP_ROUTE } from "@/lib/stp/constants";
import {
  journeyApplySchema,
  journeyEnsureSchema,
  journeyProposeSchema,
  notesSchema,
  personaExpectedSchema,
  personaIdSchema,
  personaResolveSchema,
  personaSaveSchema,
  personaStepSchema,
  personaVersionSchema,
  phaseArchiveSchema,
  phaseMoveSchema,
  phaseSaveSchema,
  portraitIdSchema,
  portraitStartSchema,
} from "@/modules/persona/schema";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function revalidatePersona(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${PERSONA_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${STP_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
  revalidatePath(`/klanten/${tenantId}`);
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mapWorkbench(raw: Record<string, unknown>): PersonaWorkbench {
  return {
    version: raw.version as PersonaWorkbench["version"],
    icp: raw.icp as PersonaWorkbench["icp"],
    personas: asArray<Persona>(raw.personas).map((persona) => ({
      ...persona,
      decision_roles: asArray(persona.decision_roles),
      portraits: asArray<PersonaPortrait>(persona.portraits),
      refs: asArray<PersonaRef>(persona.refs),
      ai_payload: persona.ai_payload && typeof persona.ai_payload === "object" ? persona.ai_payload : {},
    })),
    journeys: asArray<Journey>(raw.journeys).map((journey) => ({
      ...journey,
      phases: asArray<JourneyPhase>(journey.phases).map((phase) => ({
        ...phase,
        involved_persona_ids: asArray<string>(phase.involved_persona_ids),
      })),
      ai_proposal: journey.ai_proposal && typeof journey.ai_proposal === "object" ? journey.ai_proposal : {},
    })),
    inputs: raw.inputs as PersonaWorkbench["inputs"],
  };
}

export async function loadPersonaWorkbenchAction(tenantId: string, versionId?: string): Promise<ActionResult<PersonaWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_persona_workbench", {
    p_tenant_id: tenantId,
    p_version_id: versionId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "Workbench gaf geen data terug." };
  return { ok: true, data: await withPortraitUrls(mapWorkbench(data as Record<string, unknown>)) };
}

async function withPortraitUrls(wb: PersonaWorkbench): Promise<PersonaWorkbench> {
  const paths = wb.personas.flatMap((persona) => persona.portraits.map((portrait) => portrait.storage_path));
  const urls = await signPersonaPaths(paths);
  return {
    ...wb,
    personas: wb.personas.map((persona) => ({
      ...persona,
      portraits: persona.portraits.map((portrait) => ({ ...portrait, url: urls[portrait.storage_path] })),
    })),
  };
}

async function call(tenantId: string, fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  revalidatePersona(tenantId);
  return { ok: true };
}

export async function setPersonaStepAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "set_persona_step", { p_version_id: parsed.data.versionId, p_step: parsed.data.step });
}

export async function savePersonaAction(tenantId: string, input: unknown): Promise<ActionResult<{ personaId: string }>> {
  const parsed = personaSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("upsert_persona", {
    p_version_id: d.versionId,
    p_persona_id: d.personaId,
    p_payload: {
      role_title: d.roleTitle,
      display_name: d.displayName,
      summary: d.summary,
      decision_roles: d.decisionRoles,
      relevance: d.relevance,
      goals: d.goals,
      outcomes: d.outcomes,
      responsibilities: d.responsibilities,
      success_criteria: d.successCriteria,
      pains: d.pains,
      barriers: d.barriers,
      risks: d.risks,
      consequences: d.consequences,
      triggers: d.triggers,
      decision_criteria: d.decisionCriteria,
      objections: d.objections,
      info_needed: d.infoNeeded,
      other_roles: d.otherRoles,
      touchpoints: d.touchpoints,
      questions: d.questions,
      arguments: d.arguments,
      proof_needed: d.proofNeeded,
      channels: d.channels,
      assumptions: d.assumptions,
      open_question: d.openQuestion,
      conflict_note: d.conflictNote,
      hypothesis: d.hypothesis,
      evidence_level: d.evidenceLevel,
      active: d.active,
    },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePersona(tenantId);
  return { ok: true, data: { personaId: String(data) } };
}

export async function archivePersonaAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "archive_persona", { p_persona_id: parsed.data.personaId });
}

export async function resolvePersonaProposalAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaResolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "resolve_persona_proposal", { p_persona_id: parsed.data.personaId, p_accept: parsed.data.accept });
}

export async function confirmPersonasAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "confirm_personas", { p_version_id: parsed.data.versionId });
}

export async function proposePersonasAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaExpectedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadPersonaWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  if (loaded.data.version.updated_at !== parsed.data.expectedUpdatedAt) {
    return { ok: false, error: "De analyse is gewijzigd. Genereer opnieuw." };
  }
  try {
    const proposal = await proposePersonas(loaded.data);
    if (proposal.personas.length === 0) {
      return { ok: false, error: "Het dossier draagt nog geen beslisrol. Maak er zelf een, of werk het ICP bij." };
    }
    const active = loaded.data.personas.filter((persona) => !persona.archived_at);
    return call(tenantId, "save_persona_ai_result", {
      p_version_id: parsed.data.versionId,
      p_expected: parsed.data.expectedUpdatedAt,
      p_payload: proposal,
      p_apply_new: active.length === 0 || active.every((persona) => persona.ai_state === "proposed"),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Het voorstel is mislukt. Je tekst blijft staan." };
  }
}

export async function ensureJourneyAction(tenantId: string, input: unknown): Promise<ActionResult<{ journeyId: string }>> {
  const parsed = journeyEnsureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("ensure_persona_journey", {
    p_version_id: parsed.data.versionId,
    p_kind: parsed.data.kind,
    p_primary: parsed.data.primaryPersonaId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePersona(tenantId);
  return { ok: true, data: { journeyId: String(data) } };
}

export async function savePhaseAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = phaseSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "upsert_persona_phase", {
    p_journey_id: d.journeyId,
    p_phase_id: d.phaseId,
    p_payload: {
      name: d.name, goal: d.goal, actions: d.actions, questions: d.questions, info_need: d.infoNeed,
      decision_criteria: d.decisionCriteria, barriers: d.barriers, next_step: d.nextStep, touchpoints: d.touchpoints,
      channels: d.channels, involved_persona_ids: d.involvedPersonaIds, company_side: d.companySide, content_needed: d.contentNeeded, assumption: d.assumption,
      open_question: d.openQuestion, emotion: d.emotion, improvement: d.improvement, proposed_action: d.proposedAction,
      contribution: d.contribution, owner_name: d.ownerName, priority: d.priority, hypothesis: d.hypothesis,
    },
  });
}

export async function movePhaseAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = phaseMoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "move_persona_phase", { p_phase_id: parsed.data.phaseId, p_direction: parsed.data.direction });
}

export async function archivePhaseAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = phaseArchiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "archive_persona_phase", { p_phase_id: parsed.data.phaseId, p_restore: parsed.data.restore });
}

export async function deriveDesiredJourneyAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "derive_desired_journey", { p_version_id: parsed.data.versionId });
}

export async function proposeJourneyAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = journeyProposeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadPersonaWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  if (loaded.data.version.updated_at !== parsed.data.expectedUpdatedAt) {
    return { ok: false, error: "De klantreis is gewijzigd. Stel opnieuw voor." };
  }
  try {
    const proposal = await proposeJourney({ wb: loaded.data, roleTitle: parsed.data.roleTitle, kind: parsed.data.kind });
    if (proposal.phases.length === 0) return { ok: false, error: "Er is te weinig om fasen voor te stellen. Bouw de reis zelf." };
    return call(tenantId, "save_journey_proposal", {
      p_journey_id: parsed.data.journeyId,
      p_expected: parsed.data.expectedUpdatedAt,
      p_payload: proposal,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Het reisvoorstel is mislukt. Je fasen blijven staan." };
  }
}

export async function applyJourneyProposalAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = journeyApplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "apply_journey_proposal", { p_journey_id: parsed.data.journeyId, p_replace: parsed.data.replace });
}

export async function confirmJourneysAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "confirm_journeys", { p_version_id: parsed.data.versionId });
}

export async function savePersonaNotesAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = notesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "save_persona_notes", {
    p_version_id: parsed.data.versionId,
    p_uncertainty: parsed.data.uncertainty,
    p_questions: parsed.data.questions,
  });
}

export async function approvePersonaAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaExpectedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "approve_persona_version", { p_version_id: parsed.data.versionId, p_expected: parsed.data.expectedUpdatedAt });
}

export async function createPersonaRevisionAction(tenantId: string, input: unknown): Promise<ActionResult<{ versionId: string }>> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("create_persona_revision", { p_version_id: parsed.data.versionId });
  if (error) return { ok: false, error: error.message };
  revalidatePersona(tenantId);
  return { ok: true, data: { versionId: String(data) } };
}

export async function publishPersonaAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "publish_persona_version", { p_version_id: parsed.data.versionId });
}

export async function unpublishPersonaAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "unpublish_persona_version", { p_version_id: parsed.data.versionId });
}

export async function startPersonaPortraitAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = portraitStartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await authed();
  const started = await supabase.schema("app").rpc("start_persona_portrait", {
    p_persona_id: parsed.data.personaId,
    p_prompt: parsed.data.prompt,
    p_limit: portraitDailyLimit(),
  });
  if (started.error) return { ok: false, error: started.error.message };
  const body = started.data as { id?: string; fresh?: boolean } | null;
  const portraitId = body?.id;
  if (!portraitId) return { ok: false, error: "Het portret kon niet worden gestart." };
  if (body?.fresh) {
    const prompt = parsed.data.prompt;
    after(async () => {
      const client = await createClient();
      try {
        const rendered = await renderPortrait(prompt);
        const path = `${tenantId}/${parsed.data.personaId}/${portraitId}.png`;
        const admin = createAdminClient();
        const uploaded = await admin.storage.from("persona-portraits").upload(path, rendered.bytes, { contentType: "image/png", upsert: true });
        if (uploaded.error) throw new Error(uploaded.error.message);
        const done = await client.schema("app").rpc("complete_persona_portrait", {
          p_portrait_id: portraitId,
          p_path: path,
          p_model: rendered.model,
        });
        if (done.error) throw new Error(done.error.message);
      } catch (err) {
        await client.schema("app").rpc("fail_persona_portrait", {
          p_portrait_id: portraitId,
          p_error: err instanceof Error ? err.message : "Portretgeneratie mislukt",
        });
      }
      revalidatePersona(tenantId);
    });
  }
  revalidatePersona(tenantId);
  return { ok: true };
}

export async function failPersonaPortraitAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = portraitIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "fail_persona_portrait", { p_portrait_id: parsed.data.portraitId, p_error: "Geannuleerd. Je kunt opnieuw proberen." });
}

export async function selectPersonaPortraitAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = portraitIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "select_persona_portrait", { p_portrait_id: parsed.data.portraitId });
}

export async function exportPersonaTextAction(tenantId: string, input: unknown): Promise<ActionResult<{ text: string }>> {
  const parsed = personaVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadPersonaWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const wb = loaded.data;
  const lines = [
    wb.version.status === "approved" ? "Goedgekeurde persona's en klantreis" : "Concept — persona's en klantreis",
    `Versie ${wb.version.version_number}`,
    wb.inputs.tenant.name,
    `ICP: ${wb.icp.name || "nog niet gekoppeld"} · versie ${wb.icp.version_number ?? "-"}`,
    "",
    ...wb.personas.filter((persona) => !persona.archived_at).flatMap((persona) => [
      persona.role_title,
      persona.summary,
      persona.hypothesis ? "Hypothese" : "Onderbouwd",
      "Portret: AI-visualisatie, fictief.",
      "",
    ]),
    ...wb.journeys.filter((journey) => !journey.archived_at).flatMap((journey) => [
      journey.kind === "desired" ? "Gewenste reis" : "Huidige reis",
      ...journey.phases.filter((phase) => !phase.archived_at).map((phase) => `- ${phase.name}: ${phase.goal || "doel nog leeg"}${phase.improvement ? ` · kans: ${phase.improvement}` : ""}`),
      "",
    ]),
    wb.version.open_questions ? `Open vragen: ${wb.version.open_questions}` : "",
  ];
  const supabase = await authed();
  const logged = await supabase.schema("app").rpc("log_persona_export", { p_version_id: parsed.data.versionId });
  if (logged.error) return { ok: false, error: logged.error.message };
  return { ok: true, data: { text: lines.filter((line) => line !== undefined).join("\n") } };
}

export async function signPersonaPaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    const admin = createAdminClient();
    const urls: Record<string, string> = {};
    for (const path of unique) {
      const signed = await admin.storage.from("persona-portraits").createSignedUrl(path, 60 * 60);
      if (signed.data?.signedUrl) urls[path] = signed.data.signedUrl;
    }
    return urls;
  } catch {
    return {};
  }
}

export async function loadPersonaPublishedAction(tenantId: string): Promise<PersonaPublished | null> {
  const session = await requireSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_persona_published", { p_tenant_id: tenantId });
  if (error || !data || typeof data !== "object") return null;
  const published = data as PersonaPublished;
  if (!published.published || !published.personas?.length) return published;
  const urls = await signPersonaPaths(published.personas.map((persona) => persona.storage_path));
  return {
    ...published,
    personas: published.personas.map((persona) => ({ ...persona, url: urls[persona.storage_path] })),
  };
}
