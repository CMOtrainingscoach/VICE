import { describe, expect, it } from "vitest";
import { corpusHasNumber, keepGrounded, stripUngroundedFigures } from "@/lib/bcg/grounding";
import {
  formatMultiple,
  formatPercent,
  marketGrowth,
  matrixPosition,
  parseBcgNumber,
  placeItem,
  quadrantOf,
  relativeShare,
  unresolvedOverlapIds,
  type PlacementInput,
} from "@/lib/bcg/math";

function base(overrides: Partial<PlacementInput> = {}): PlacementInput {
  return {
    growth: { method: "direct", directPercent: 12, previousSize: null, currentSize: null, previousScale: "units", currentScale: "units" },
    share: {
      method: "from_shares",
      ownSharePercent: 15,
      leaderSharePercent: 10,
      ownAmount: null,
      leaderAmount: null,
      ownScale: "units",
      leaderScale: "units",
    },
    growthThreshold: 10,
    shareThreshold: 1,
    thresholdsConfirmed: true,
    growthEvidence: "measured",
    shareEvidence: "provided",
    scopeConfirmed: true,
    periodKind: "year",
    versionPeriodKind: "year",
    measureBasis: "value",
    conflict: "",
    conflictAccepted: false,
    leaderName: "Concurrent A",
    clientIsLeader: false,
    ...overrides,
  };
}

describe("parseBcgNumber", () => {
  it("keeps unknown empty and keeps an explicit zero", () => {
    expect(parseBcgNumber("")).toBeNull();
    expect(parseBcgNumber("onbekend")).toBeNull();
    expect(parseBcgNumber("0")).toBe(0);
    expect(parseBcgNumber("1.500")).toBe(1.5);
    expect(parseBcgNumber("1.500,5")).toBe(1500.5);
    expect(parseBcgNumber("=12")).toBeNull();
  });
});

describe("marketGrowth", () => {
  it("calculates growth and refuses a zero or missing base", () => {
    expect(marketGrowth({ method: "from_size", directPercent: null, previousSize: 100, currentSize: 80, previousScale: "units", currentScale: "units" }).value).toBe(-20);
    expect(marketGrowth({ method: "from_size", directPercent: null, previousSize: 0, currentSize: 10, previousScale: "units", currentScale: "units" }).value).toBeNull();
    expect(marketGrowth({ method: "from_size", directPercent: null, previousSize: null, currentSize: 10, previousScale: "units", currentScale: "units" }).value).toBeNull();
    expect(marketGrowth({ method: "from_size", directPercent: null, previousSize: 1, currentSize: 2, previousScale: "thousands", currentScale: "millions" }).reason).toMatch(/vermengd/);
  });
});

describe("relativeShare", () => {
  it("shows a multiple and refuses a zero denominator", () => {
    const ratio = relativeShare({
      method: "from_shares",
      ownSharePercent: 15,
      leaderSharePercent: 10,
      ownAmount: null,
      leaderAmount: null,
      ownScale: "units",
      leaderScale: "units",
    });
    expect(ratio.value).toBe(1.5);
    expect(formatMultiple(ratio.value ?? 0)).toBe("1,5×");
    expect(relativeShare({
      method: "from_shares",
      ownSharePercent: 10,
      leaderSharePercent: 0,
      ownAmount: null,
      leaderAmount: null,
      ownScale: "units",
      leaderScale: "units",
    }).value).toBeNull();
  });

  it("treats zero own revenue as a real zero and unknown as missing", () => {
    const zero = relativeShare({
      method: "from_amounts",
      ownSharePercent: null,
      leaderSharePercent: null,
      ownAmount: 0,
      leaderAmount: 100,
      ownScale: "units",
      leaderScale: "units",
    });
    expect(zero.value).toBe(0);
    expect(relativeShare({
      method: "from_amounts",
      ownSharePercent: null,
      leaderSharePercent: null,
      ownAmount: null,
      leaderAmount: 100,
      ownScale: "units",
      leaderScale: "units",
    }).value).toBeNull();
  });
});

describe("quadrant boundaries", () => {
  it("treats equality as the high side", () => {
    expect(quadrantOf(10, 1, 10, 1)).toBe("star");
    expect(quadrantOf(10, 0.99, 10, 1)).toBe("question_mark");
    expect(quadrantOf(9.99, 1, 10, 1)).toBe("cash_cow");
    expect(quadrantOf(-4, 0.4, 10, 1)).toBe("dog");
  });

  it("does not place an item when the growth threshold is absent", () => {
    const reading = placeItem(base({ growthThreshold: null }));
    expect(reading.placeable).toBe(false);
    expect(reading.previewQuadrant).toBeNull();
    expect(reading.reasons.join(" ")).toMatch(/groeigrens/i);
  });

  it("shows a preview before the market definition is confirmed", () => {
    const reading = placeItem(base({ scopeConfirmed: false }));
    expect(reading.previewQuadrant).toBe("star");
    expect(reading.placeable).toBe(false);
  });

  it("marks estimates as provisional and near-boundary cases as sensitive", () => {
    const reading = placeItem(base({ growth: { method: "direct", directPercent: 10.4, previousSize: null, currentSize: null, previousScale: "units", currentScale: "units" }, growthEvidence: "estimate" }));
    expect(reading.placeable).toBe(true);
    expect(reading.provisional).toBe(true);
    expect(reading.sensitive).toBe(true);
    expect(formatPercent(12.5)).toBe("12,5%");
  });
});

describe("matrixPosition", () => {
  it("puts high share on the left and high growth on top", () => {
    const high = matrixPosition(20, 2, 10, 1);
    const low = matrixPosition(0, 0.2, 10, 1);
    expect(high.x).toBeLessThan(50);
    expect(high.y).toBeLessThan(50);
    expect(low.x).toBeGreaterThan(50);
    expect(low.y).toBeGreaterThan(50);
  });
});

describe("overlap", () => {
  it("requires an explicit single count when a product also sits in a selected group", () => {
    const open = unresolvedOverlapIds([
      { id: "g", selected: true, parentId: null, overlapKey: "", overlapMode: "unset" },
      { id: "p", selected: true, parentId: "g", overlapKey: "", overlapMode: "unset" },
    ]);
    expect(open.sort()).toEqual(["g", "p"]);
    const closed = unresolvedOverlapIds([
      { id: "g", selected: true, parentId: null, overlapKey: "", overlapMode: "excluded" },
      { id: "p", selected: true, parentId: "g", overlapKey: "", overlapMode: "count" },
      { id: "q", selected: true, parentId: "g", overlapKey: "", overlapMode: "excluded" },
    ]);
    expect(closed).toEqual([]);
  });
});

describe("grounding", () => {
  it("keeps only figures that appear in the sources", () => {
    const corpus = "De markt groeide met 12% . Omzet van de klant was 1.200.";
    expect(corpusHasNumber(corpus, 12)).toBe(true);
    expect(corpusHasNumber(corpus, 1200)).toBe(true);
    expect(keepGrounded(8, corpus)).toBeNull();
    expect(corpusHasNumber("12,5%", 12)).toBe(false);
    expect(stripUngroundedFigures("groei € 8 en 12%", corpus)).toBe("groei en 12%");
  });
});
