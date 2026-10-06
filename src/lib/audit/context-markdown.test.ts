import { describe, expect, it } from "vitest";
import { buildAuditContextMarkdown, type AuditContextSource, type FrameworkLoad } from "@/lib/audit/context-markdown";
import type { BrandWorkbench } from "@/lib/brand/types";

const missing: FrameworkLoad<never> = { state: "missing" };

function source(patch: Partial<AuditContextSource> = {}): AuditContextSource {
  return {
    company: { name: "Studio Noord", website: "https://example.com", auditGoal: "Merk scherper krijgen" },
    savedAt: "2026-10-06T10:00:00.000Z",
    meetings: [],
    documents: [],
    pestel: missing,
    porter: missing,
    fiveC: missing,
    swot: missing,
    vrio: missing,
    bcg: missing,
    valueChain: missing,
    stp: missing,
    persona: missing,
    brand: {
      version: {
        id: "v",
        version_number: 1,
        status: "draft",
        current_step: "overview",
        model: "keller",
        stp_version_id: null,
        persona_version_id: null,
        website_url: "https://example.com",
        period_label: "",
        research_availability: "unknown",
        scope_note: "",
        verdict: "Het merk zegt helder wat het doet.",
        strongest: "",
        weakest: "",
        unassessed: "Bekendheid is niet onderzocht.",
        gap_summary: "",
        positioning_intended: "",
        perception_observed: "Geen onafhankelijke marktperceptie in de bronnen.",
        accepted_uncertainty: "Er is geen onafhankelijk merkonderzoek.",
        open_questions: "",
        sources_confirmed: true,
        website_confirmed: true,
        image_confirmed: true,
        needs_review: false,
        review_note: "",
        published_at: null,
        approved_at: null,
        updated_at: "2026-10-06T10:00:00.000Z",
      },
      links: { stp: { present: false }, personas: { present: false, people: [] }, journeys: { count: 0 } },
      tenant: { id: "t", name: "Studio Noord", website: "https://example.com" },
      sources: [],
      pages: [],
      findings: [{
        id: "f",
        page_id: null,
        source_id: null,
        lens: "text",
        observation: "De homepage noemt advies.",
        meaning: "Dat is wat de site zegt.",
        proposal: "",
        hypothesis: true,
        persona_label: "",
        phase_label: "",
      }],
      dimensions: [],
      priorities: [],
    } satisfies BrandWorkbench,
    ...patch,
  };
}

describe("buildAuditContextMarkdown", () => {
  it("keeps stored text and labels a hypothesis", () => {
    const markdown = buildAuditContextMarkdown(source());
    expect(markdown).toContain("# Strategische audit — Studio Noord");
    expect(markdown).toContain("Het merk zegt helder wat het doet.");
    expect(markdown).toContain("Bekendheid is niet onderzocht.");
    expect(markdown).toContain("Bevinding · text (hypothese)");
    expect(markdown).toContain("## 2. Porter");
    expect(markdown).toContain("Nog niet gestart");
    expect(markdown).not.toContain("Ansoff");
  });
});
