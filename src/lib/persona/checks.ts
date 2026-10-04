import type { PersonaWorkbench } from "@/lib/persona/types";

export type PersonaLevel = "ready" | "attention" | "block";
export type PersonaCheck = { id: string; label: string; level: PersonaLevel; detail: string };

export function activePersonas(wb: PersonaWorkbench) {
  return wb.personas.filter((persona) => !persona.archived_at && persona.active && persona.ai_state !== "proposed");
}

export function personaChecks(wb: PersonaWorkbench): PersonaCheck[] {
  const active = activePersonas(wb);
  const journeys = wb.journeys.filter((journey) => !journey.archived_at);
  const checks: PersonaCheck[] = [];
  checks.push(wb.icp.present && wb.icp.approved
    ? { id: "icp", label: "Goedgekeurd ICP", level: "ready", detail: `${wb.icp.name || "ICP"} · versie ${wb.icp.version_number}` }
    : { id: "icp", label: "Goedgekeurd ICP", level: "block", detail: "Definitieve goedkeuring wacht op een goedgekeurd ICP." });
  checks.push(active.length > 0
    ? { id: "people", label: "Actieve persona's", level: "ready", detail: `${active.length} persona` }
    : { id: "people", label: "Actieve persona's", level: "block", detail: "Er is nog geen actieve persona." });
  const thin = active.filter((persona) => persona.role_title.trim().length < 2 || (persona.goals.trim().length < 8 && persona.pains.trim().length < 8));
  checks.push(thin.length === 0 && active.length > 0
    ? { id: "role", label: "Rol en behoefte", level: "ready", detail: "Functierol en doel of probleem zijn ingevuld." }
    : { id: "role", label: "Rol en behoefte", level: "block", detail: "Een actieve persona mist een functierol of een bruikbaar doel of probleem." });
  const openConflict = active.some((persona) => persona.conflict_note.trim().length > 0) && wb.version.accepted_uncertainty.trim().length < 10;
  checks.push(openConflict
    ? { id: "conflict", label: "Tegenstrijdigheid", level: "block", detail: "Benoem de onzekerheid of los de tegenstrijdigheid op." }
    : { id: "conflict", label: "Tegenstrijdigheid", level: "ready", detail: "Geen open tegenstrijdigheid." });
  const primaries = active.filter((persona) => persona.audience_rank === "primary");
  checks.push(primaries.length === 1
    ? { id: "primary", label: "Primaire persona", level: "ready", detail: primaries[0]?.role_title || "Gekozen" }
    : { id: "primary", label: "Primaire persona", level: "block", detail: "Kies één primaire persona. De anderen zijn secundair." });
  const primary = primaries[0];
  const primaryJourney = primary
    ? journeys.some((journey) => journey.primary_persona_id === primary.id && journey.phases.some((phase) => !phase.archived_at && phase.goal.trim().length >= 8))
    : false;
  checks.push(primaryJourney
    ? { id: "journey", label: "Klantreis van de primaire persona", level: "ready", detail: "Minstens één fase heeft een klantdoel." }
    : { id: "journey", label: "Klantreis van de primaire persona", level: "block", detail: "Geef de primaire persona een klantreis met een klantdoel." });
  const missingSecondary = active.filter((persona) => persona.audience_rank !== "primary" && !journeys.some((journey) => journey.primary_persona_id === persona.id && journey.phases.some((phase) => !phase.archived_at)));
  if (missingSecondary.length > 0) {
    checks.push({ id: "secondary-journey", label: "Secundaire klantreizen", level: "attention", detail: `${missingSecondary.map((persona) => persona.role_title).join(", ")} ${missingSecondary.length === 1 ? "heeft" : "hebben"} nog geen eigen klantreis.` });
  }
  const missingPortrait = active.filter((persona) => !persona.portraits.some((portrait) => portrait.id === persona.selected_portrait_id && portrait.status === "ready"));
  checks.push(missingPortrait.length === 0
    ? { id: "portrait", label: "Portretten", level: "ready", detail: "Elke actieve persona heeft een gekozen visualisatie." }
    : { id: "portrait", label: "Portretten", level: "attention", detail: "Publicatie wacht op een gekozen portret. Het concept blijft bruikbaar." });
  checks.push(wb.version.needs_review
    ? { id: "upstream", label: "ICP-versie", level: wb.version.accepted_uncertainty.trim().length >= 10 ? "attention" : "block", detail: wb.version.review_note || "Het ICP is gewijzigd." }
    : { id: "upstream", label: "ICP-versie", level: "ready", detail: "Geen nieuwere goedgekeurde ICP-versie." });
  const hypotheses = active.filter((persona) => persona.hypothesis).length;
  if (hypotheses > 0) checks.push({ id: "hypothesis", label: "Hypotheses", level: "attention", detail: `${hypotheses} persona blijft een werkhypothese.` });
  return checks;
}

export function approvalBlocked(checks: PersonaCheck[]): boolean {
  return checks.some((check) => check.level === "block");
}

export function publishBlocked(wb: PersonaWorkbench): boolean {
  return activePersonas(wb).some((persona) => !persona.portraits.some((portrait) => portrait.id === persona.selected_portrait_id && portrait.status === "ready" && portrait.storage_path));
}
