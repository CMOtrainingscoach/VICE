import { describe, expect, it } from "vitest";
import { approvalBlocked, stpChecks } from "@/lib/stp/checks";
import type { StpWorkbench } from "@/lib/stp/types";

function wb(partial: Partial<StpWorkbench["version"]> = {}, segments: StpWorkbench["segments"] = []): StpWorkbench {
  return {
    version: {
      id: "v",
      version_number: 1,
      status: "draft",
      current_step: "icp",
      offering: "Advies",
      geography: "België",
      scope_note: "",
      scope_confirmed: true,
      segments_confirmed: true,
      target_confirmed: true,
      position_confirmed: true,
      target_motivation: "Past bij het aanbod",
      preference_note: "",
      preference_tradeoffs: "",
      preference_risks: "",
      primary_segment_id: "s",
      audience: "Groeiende kmo's",
      problem: "Geen duidelijke positionering",
      promise: "Persoonlijk strategisch advies",
      distinction: "",
      evidence_text: "",
      position_sentence: "",
      claim_status: "hypothesis",
      icp_name: "Groeiende kmo",
      icp_summary: "Een kmo die strategische begeleiding zoekt.",
      icp_sector: "",
      icp_stage: "",
      icp_size: "",
      icp_structure: "",
      icp_tech: "",
      icp_problem: "",
      icp_need: "",
      icp_outcome: "",
      icp_trigger: "",
      icp_inaction: "",
      icp_budget: "",
      icp_capacity: "",
      icp_conditions: "",
      icp_timing: "",
      assumptions: "",
      open_questions: "",
      accepted_uncertainty: "",
      needs_review: false,
      review_note: "",
      ai_proposal: {},
      ai_generated_at: null,
      published_at: null,
      approved_at: null,
      updated_at: "",
      pestel_version_id: null,
      porter_version_id: null,
      five_c_version_id: null,
      swot_version_id: null,
      vrio_version_id: null,
      bcg_version_id: null,
      vc_version_id: null,
      ...partial,
    },
    segments,
    criteria: [{ id: "c", kind: "must", body: "Heeft een groeipad", sort_order: 0 }],
    inputs: {
      tenant: { id: "t", name: "Studio", website: null, audit_goal: "" },
      five_c_items: [],
      swot_items: [],
      vrio_resources: [],
      pestel_insights: [],
      porter_forces: [],
      bcg_items: [],
      vc_activities: [],
      meetings: [],
    },
  };
}

const primary = {
  id: "s",
  name: "Groeiende kmo's",
  description: "",
  need: "Ze missen een heldere koers",
  traits: "",
  geography: "",
  trigger_text: "",
  offering: "",
  include_criteria: "",
  exclude_criteria: "",
  assumptions: "",
  open_question: "",
  hypothesis: false,
  disposition: "primary" as const,
  exclusion_reason: "",
  overlap_note: "",
  manual_lock: false,
  origin: "manual" as const,
  ai_state: "none" as const,
  ai_payload: {},
  archived_at: null,
  sort_order: 0,
  updated_at: "",
  scores: [],
  refs: [],
};

describe("stpChecks", () => {
  it("laat onbekend budget een aandachtspunt zijn", () => {
    const checks = stpChecks(wb({}, [primary]));
    expect(checks.find((item) => item.id === "budget")?.level).toBe("attention");
    expect(approvalBlocked(checks)).toBe(false);
  });

  it("blokkeert zonder primaire doelgroep", () => {
    const checks = stpChecks(wb({}, [{ ...primary, disposition: "unset" }]));
    expect(checks.find((item) => item.id === "primary")?.level).toBe("block");
    expect(approvalBlocked(checks)).toBe(true);
  });

  it("telt een bronwijziging als blokkade tot de onzekerheid is benoemd", () => {
    const open = stpChecks(wb({ needs_review: true, review_note: "VRIO is herzien" }, [primary]));
    expect(open.find((item) => item.id === "sources")?.level).toBe("block");
    const accepted = stpChecks(wb({ needs_review: true, accepted_uncertainty: "VRIO-wijziging raakt dit ICP niet." }, [primary]));
    expect(accepted.find((item) => item.id === "sources")?.level).toBe("attention");
  });
});
