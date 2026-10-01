import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FiveCCatalogEntry } from "@/lib/marketing-5c/input-catalog";
import {
  sourceSupportRatio,
  unsupportedNumbers,
  validateAiCoherencePoint,
  validateAiContradiction,
  validateAiItem,
} from "@/lib/marketing-5c/validate-ai-output";

function entry(partial: Partial<FiveCCatalogEntry> & Pick<FiveCCatalogEntry, "ref_type" | "ref_id" | "text">): FiveCCatalogEntry {
  return {
    key: `${partial.ref_type}:${partial.ref_id}`,
    group: "dossier",
    label: partial.ref_type,
    date: null,
    evidence_level: null,
    force_key: null,
    ...partial,
  };
}

const meeting = entry({
  ref_type: "meeting",
  ref_id: "m1",
  text: "Hardwig begeleidt marketingteams met coaching en trainingen. Klanten vragen vooral om praktische workshops.",
  date: "2026-09-01",
});
const meeting2 = entry({
  ref_type: "meeting",
  ref_id: "m2",
  text: "Een tweede klant vraagt ook praktische workshops en snelle opvolging.",
});
const buyers = entry({
  ref_type: "porter_force",
  ref_id: "f1",
  group: "porter",
  force_key: "buyers",
  text: "Afnemers kunnen eenvoudig overstappen naar alternatieve trainers.",
});
const substitutes = entry({
  ref_type: "porter_factor",
  ref_id: "f2",
  group: "porter",
  force_key: "substitutes",
  text: "Online cursussen vormen een substituut voor klassikale trainingen.",
});
const suppliers = entry({
  ref_type: "porter_force",
  ref_id: "f3",
  group: "porter",
  force_key: "suppliers",
  text: "Leveranciers van trainingsplatformen hebben beperkte macht.",
});
const pestel = entry({
  ref_type: "pestel_insight",
  ref_id: "p1",
  group: "pestel",
  evidence_level: "hypothesis",
  text: "Digitalisering van opleidingen versnelt in Vlaanderen.",
});

const map = new Map<string, FiveCCatalogEntry>([
  ["S1", meeting],
  ["S2", meeting2],
  ["S3", buyers],
  ["S4", substitutes],
  ["S5", suppliers],
  ["S6", pestel],
]);

describe("validateAiItem", () => {
  it("flags adopted findings without valid refs", () => {
    const v = validateAiItem(
      { title: "Coaching", finding: "Hardwig biedt coaching", content_type: "adopted", refs: ["S99"] },
      "company",
      map,
    );
    expect(v?.unsupported).toBe(true);
    expect(v?.refs).toHaveLength(0);
  });

  it("rejects refs that are not allowed for the C", () => {
    const v = validateAiItem(
      { title: "Trend", finding: "Digitalisering versnelt", content_type: "adopted", refs: ["S6"] },
      "company",
      map,
    );
    expect(v?.refs).toHaveLength(0);
    expect(v?.unsupported).toBe(true);
  });

  it("flags numbers that do not appear in the source", () => {
    const v = validateAiItem(
      {
        title: "Coaching",
        finding: "Hardwig begeleidt marketingteams met coaching en haalt 35% marge",
        content_type: "adopted",
        refs: ["S1"],
      },
      "company",
      map,
    );
    expect(v?.unsupported).toBe(true);
    expect(v?.unsupported_reason).toContain("35%");
  });

  it("accepts a supported adopted finding", () => {
    const v = validateAiItem(
      {
        title: "Coaching en trainingen",
        finding: "Hardwig begeleidt marketingteams met coaching en trainingen.",
        content_type: "adopted",
        evidence_level: "provided",
        refs: ["S1"],
      },
      "company",
      map,
    );
    expect(v?.unsupported).toBe(false);
    expect(v?.evidence_level).toBe("provided");
  });

  it("downgrades a customer pattern with one source to single statement", () => {
    const v = validateAiItem(
      { title: "Workshops", finding: "Klanten vragen praktische workshops", content_type: "adopted", qualifier: "pattern", refs: ["S1"] },
      "customers",
      map,
    );
    expect(v?.qualifier).toBe("single_statement");
  });

  it("keeps a pattern when two dossier sources support it", () => {
    const v = validateAiItem(
      { title: "Workshops", finding: "Klanten vragen praktische workshops", content_type: "derived", qualifier: "pattern", refs: ["S1", "S2"] },
      "customers",
      map,
    );
    expect(v?.qualifier).toBe("pattern");
  });

  it("treats buyer power alone as a hypothesis, not a proven need", () => {
    const v = validateAiItem(
      { title: "Overstappen", finding: "Afnemers kunnen eenvoudig overstappen", content_type: "adopted", evidence_level: "observed", refs: ["S3"] },
      "customers",
      map,
    );
    expect(v?.qualifier).toBe("hypothesis");
    expect(v?.evidence_level).toBe("hypothesis");
  });

  it("does not silently turn substitutes into direct competitors", () => {
    const v = validateAiItem(
      { title: "Online cursussen", finding: "Online cursussen vormen een substituut", content_type: "adopted", qualifier: "direct", refs: ["S4"] },
      "competitors",
      map,
    );
    expect(v?.qualifier).toBe("substitute");
  });

  it("marks Porter-only suppliers as market supplier info, not partners", () => {
    const v = validateAiItem(
      { title: "Platformen", finding: "Leveranciers van trainingsplatformen hebben beperkte macht", content_type: "adopted", qualifier: "confirmed", refs: ["S5"] },
      "collaborators",
      map,
    );
    expect(v?.qualifier).toBe("market_supplier");
  });

  it("flags invented partner names", () => {
    const v = validateAiItem(
      { title: "Partner", finding: "Leveranciers van trainingsplatformen zoals Udemy hebben beperkte macht", content_type: "adopted", refs: ["S5"] },
      "collaborators",
      map,
    );
    expect(v?.unsupported).toBe(true);
    expect(v?.unsupported_reason).toContain("Udemy");
  });

  it("keeps hypothesis labels from PESTEL", () => {
    const v = validateAiItem(
      { title: "Digitalisering", finding: "Digitalisering van opleidingen versnelt", content_type: "adopted", evidence_level: "observed", refs: ["S6"] },
      "context",
      map,
    );
    expect(v?.evidence_level).toBe("hypothesis");
  });

  it("adds a question for input_needed items", () => {
    const v = validateAiItem({ title: "Capaciteit", finding: "", content_type: "input_needed" }, "company", map);
    expect(v?.content_type).toBe("input_needed");
    expect(v?.open_question.length).toBeGreaterThan(5);
    expect(v?.unsupported).toBe(false);
  });
});

describe("source checks", () => {
  it("measures lexical support", () => {
    expect(sourceSupportRatio("praktische workshops", meeting.text)).toBe(1);
    expect(sourceSupportRatio("internationale expansie naar Duitsland", meeting.text)).toBe(0);
  });

  it("detects unknown numbers", () => {
    expect(unsupportedNumbers("groei van 12%", "groei van 12% verwacht")).toEqual([]);
    expect(unsupportedNumbers("groei van 20%", "groei van 12% verwacht")).toEqual(["20%"]);
  });

  it("requires two existing distinct sources for a contradiction", () => {
    expect(validateAiContradiction({ description: "x", source_a: "S1", source_b: "S1" }, map)).toBeNull();
    expect(validateAiContradiction({ description: "x", source_a: "S1", source_b: "S77" }, map)).toBeNull();
    const ok = validateAiContradiction(
      { description: "Workshops versus online", source_a: "S1", source_b: "S4", affected_keys: ["customers", "bogus"] },
      map,
    );
    expect(ok?.affected_keys).toEqual(["customers"]);
    expect(ok?.source_a.date).toBe("2026-09-01");
  });

  it("drops coherence points without refs", () => {
    expect(validateAiCoherencePoint({ statement: "Een relatie tussen onderdelen zonder bron.", refs: [] }, map)).toBeNull();
    expect(
      validateAiCoherencePoint({ statement: "Praktische workshops sluiten aan bij digitalisering.", refs: ["S1", "S6"] }, map)?.refs,
    ).toHaveLength(2);
  });
});

describe("no web capability in the 5C workflow", () => {
  it("the 5C AI module uses no tools or web evidence", () => {
    const src = readFileSync(join(__dirname, "five-c-synthesis-ai.ts"), "utf8");
    expect(src).not.toMatch(/web[-_]?evidence|web_search|tavily|serper|fetch\(|tools\s*:/i);
  });
});
