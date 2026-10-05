import { describe, expect, it } from "vitest";
import { approvalBlocked, brandChecks } from "@/lib/brand/checks";
import type { BrandWorkbench } from "@/lib/brand/types";

function wb(patch: Partial<BrandWorkbench> = {}): BrandWorkbench {
  const base: BrandWorkbench = {
    version: {
      id: "v", version_number: 1, status: "draft", current_step: "conclusion", model: "keller",
      stp_version_id: "s", persona_version_id: "p", website_url: "https://voorbeeld.be", period_label: "",
      research_availability: "unavailable", scope_note: "", verdict: "", strongest: "", weakest: "", unassessed: "",
      gap_summary: "", positioning_intended: "Persoonlijke begeleiding", perception_observed: "",
      accepted_uncertainty: "", open_questions: "", sources_confirmed: true, website_confirmed: true,
      image_confirmed: true, needs_review: false, review_note: "", published_at: null, approved_at: null, updated_at: "",
    },
    links: { stp: { present: true, approved: true, sentence: "Persoonlijke begeleiding" }, personas: { present: true, confirmed: true, people: [] }, journeys: { confirmed: true, count: 1 } },
    tenant: { id: "t", name: "Studio", website: "https://voorbeeld.be" },
    sources: [],
    pages: [],
    findings: [],
    dimensions: ["salience", "performance", "imagery", "judgements", "feelings", "resonance"].map((key, index) => ({
      id: String(index), model: "keller" as const, dimension_key: key, intended: "", observed: "", gap_note: "",
      evidence_status: "unknown" as const, judgement: "not_assessable" as const, limits_note: "", open_question: "",
      hypothesis: true, manual_lock: false,
    })),
    priorities: [],
  };
  return { ...base, ...patch, version: { ...base.version, ...patch.version } };
}

describe("brandChecks", () => {
  it("behandelt ontbrekend onderzoek niet als een zwakke prestatie", () => {
    const checks = brandChecks(wb());
    expect(checks.find((item) => item.id === "perception")?.level).toBe("attention");
    expect(checks.find((item) => item.id === "perception")?.detail).toMatch(/geen bewijs van een zwak merk/i);
    expect(approvalBlocked(checks)).toBe(true);
  });

  it("laat goedkeuring toe wanneer onbekend benoemd is en de grens expliciet staat", () => {
    const checks = brandChecks(wb({
      version: { ...wb().version, accepted_uncertainty: "Geen onafhankelijk onderzoek beschikbaar.", unassessed: "Loyaliteit is nog niet te beoordelen." },
    }));
    expect(approvalBlocked(checks)).toBe(false);
  });
});
