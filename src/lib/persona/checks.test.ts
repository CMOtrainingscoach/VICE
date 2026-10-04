import { describe, expect, it } from "vitest";
import { approvalBlocked, personaChecks, publishBlocked } from "@/lib/persona/checks";
import type { PersonaWorkbench } from "@/lib/persona/types";

function wb(extra: Partial<PersonaWorkbench> = {}): PersonaWorkbench {
  const base: PersonaWorkbench = {
    version: {
      id: "v", version_number: 1, status: "draft", current_step: "finish", stp_version_id: "s",
      personas_confirmed: true, journeys_confirmed: true, accepted_uncertainty: "", open_questions: "",
      needs_review: false, review_note: "", published_at: null, approved_at: null, updated_at: "",
    },
    icp: { present: true, approved: true, name: "Groeiende kmo", version_number: 1 },
    personas: [{
      id: "p", role_title: "Zaakvoerder", display_name: "", summary: "", decision_roles: ["decider"], relevance: "Beslist over het traject",
      goals: "Een heldere koers voor het bedrijf", outcomes: "", responsibilities: "", success_criteria: "",
      pains: "", barriers: "", risks: "", consequences: "", triggers: "", decision_criteria: "", objections: "",
      info_needed: "", other_roles: "", touchpoints: "", questions: "", arguments: "", proof_needed: "", channels: "",
      assumptions: "", open_question: "", conflict_note: "", hypothesis: true, evidence_level: "hypothesis", active: true,
      manual_lock: false, origin: "manual", ai_state: "none", ai_payload: {}, overlap_note: "", illustration_prompt: "",
      selected_portrait_id: null, archived_at: null, sort_order: 0, portraits: [], refs: [],
    }],
    journeys: [{
      id: "j", kind: "current", title: "Huidige reis", primary_persona_id: "p", based_on_id: null, route_note: "",
      hypothesis: true, ai_proposal: {}, archived_at: null,
      phases: [{
        id: "f", name: "Aanleiding", goal: "Begrijpen of begeleiding past", actions: "", questions: "", info_need: "",
        decision_criteria: "", barriers: "", next_step: "", touchpoints: "", channels: "", involved_persona_ids: [],
        company_side: "", content_needed: "", assumption: "", open_question: "", emotion: "", improvement: "",
        proposed_action: "", contribution: "", owner_name: "", priority: "unknown", hypothesis: true, sort_order: 0, archived_at: null,
      }],
    }],
    inputs: { tenant: { id: "t", name: "Studio" }, five_c_items: [], meetings: [] },
  };
  return { ...base, ...extra, version: { ...base.version, ...extra.version }, icp: { ...base.icp, ...extra.icp } };
}

describe("personaChecks", () => {
  it("laat een ontbrekend portret de goedkeuring niet blokkeren", () => {
    const checks = personaChecks(wb());
    expect(checks.find((item) => item.id === "portrait")?.level).toBe("attention");
    expect(approvalBlocked(checks)).toBe(false);
    expect(publishBlocked(wb())).toBe(true);
  });

  it("blokkeert zonder goedgekeurd ICP", () => {
    const checks = personaChecks(wb({ icp: { present: true, approved: false } }));
    expect(checks.find((item) => item.id === "icp")?.level).toBe("block");
    expect(approvalBlocked(checks)).toBe(true);
  });
});
