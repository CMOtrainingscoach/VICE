import { describe, expect, it } from "vitest";
import {
  activityMargin,
  checkAllocation,
  formatMinor,
  mapCsvLines,
  marginView,
  parseAmount,
  parseCsv,
  reconcile,
  splitByDriver,
  splitByPercent,
  timeToCost,
  toMinor,
  type CostLine,
} from "@/lib/value-chain/finance";

function line(partial: Partial<CostLine> & Pick<CostLine, "id" | "amount">): CostLine {
  return {
    scale: "units",
    kind: "detail",
    status: "confirmed",
    inScope: true,
    currency: "EUR",
    periodKey: "2025",
    entityKey: "bedrijf",
    figureType: "actual",
    isRevenue: false,
    ...partial,
  };
}

describe("parseAmount", () => {
  it("treats blank as unknown, not zero", () => {
    expect(parseAmount("").minor).toBeNull();
    expect(parseAmount("   ").minor).toBeNull();
    expect(parseAmount(null).minor).toBeNull();
    expect(parseAmount("0").minor).toBe(0n);
  });

  it("does not execute formulas", () => {
    const parsed = parseAmount("=A1+A2");
    expect(parsed.formula).toBe(true);
    expect(parsed.minor).toBeNull();
  });

  it("reads European and US decimals", () => {
    expect(parseAmount("1.234,56").minor).toBe(12345600n);
    expect(parseAmount("1,234.56").minor).toBe(12345600n);
    expect(parseAmount("(200,50)").minor).toBe(-2005000n);
  });

  it("flags an ambiguous three-digit fraction", () => {
    const parsed = parseAmount("1.234");
    expect(parsed.uncertain).toBe(true);
  });

  it("applies thousands and millions without turning unknown into zero", () => {
    expect(toMinor("1,5", "thousands", "comma").minor).toBe(15000n * 1000n);
    expect(toMinor("", "millions").minor).toBeNull();
  });
});

describe("reconcile", () => {
  it("excludes subtotals so details are not counted twice", () => {
    const buckets = reconcile(
      [
        line({ id: "a", amount: "100" }),
        line({ id: "b", amount: "40" }),
        line({ id: "sub", amount: "140", kind: "subtotal" }),
        line({ id: "tot", amount: "140", kind: "total" }),
      ],
      [],
    );
    expect(buckets[0]?.knownSourceMinor).toBe(1400000n);
    expect(buckets[0]?.tieDifferenceMinor).toBe(0n);
  });

  it("does not invent a remainder while an amount is unknown", () => {
    const buckets = reconcile([line({ id: "a", amount: "10" }), line({ id: "b", amount: null })], []);
    expect(buckets[0]?.unknownCount).toBe(1);
    expect(buckets[0]?.unassignedMinor).toBeNull();
    expect(buckets[0]?.incomplete).toBe(true);
  });

  it("keeps entities, currencies and figure types apart", () => {
    const buckets = reconcile(
      [
        line({ id: "a", amount: "10", currency: "EUR" }),
        line({ id: "b", amount: "10", currency: "USD" }),
        line({ id: "c", amount: "10", figureType: "budget" }),
      ],
      [],
    );
    expect(buckets).toHaveLength(3);
  });

  it("shows a tie difference instead of forcing the document to balance", () => {
    const buckets = reconcile(
      [line({ id: "a", amount: "80" }), line({ id: "tot", amount: "100", kind: "total" })],
      [],
    );
    expect(buckets[0]?.tieDifferenceMinor).toBe(200000n);
  });

  it("leaves the tie open when detail lines are incomplete", () => {
    const buckets = reconcile(
      [line({ id: "a", amount: "80" }), line({ id: "b", amount: null }), line({ id: "tot", amount: "100", kind: "total" })],
      [],
    );
    expect(buckets[0]?.tieDifferenceMinor).toBeNull();
  });

  it("separates confirmed and proposed assignments and keeps the remainder", () => {
    const buckets = reconcile(
      [line({ id: "a", amount: "100" })],
      [
        { lineId: "a", activityId: "x", amount: "40", status: "confirmed" },
        { lineId: "a", activityId: "y", amount: "25", status: "proposed" },
      ],
    );
    expect(buckets[0]?.assignedConfirmedMinor).toBe(400000n);
    expect(buckets[0]?.assignedProposedMinor).toBe(250000n);
    expect(buckets[0]?.unassignedMinor).toBe(350000n);
  });
});

describe("allocation", () => {
  it("refuses to allocate an unknown amount", () => {
    expect(checkAllocation(null, []).ok).toBe(false);
  });

  it("refuses to allocate more than the source", () => {
    const result = checkAllocation(1000000n, [600000n, 500000n]);
    expect(result.ok).toBe(false);
  });

  it("keeps a negative correction negative", () => {
    const ok = checkAllocation(-500000n, [-200000n, -100000n]);
    expect(ok).toEqual({ ok: true, remainder: -200000n });
    expect(checkAllocation(-500000n, [100000n]).ok).toBe(false);
    expect(formatMinor(-500000n)).toContain("−");
  });

  it("does not fall back to an equal split when a driver is missing", () => {
    const result = splitByDriver(1000000n, [
      { id: "a", value: "2" },
      { id: "b", value: null },
    ], "uren");
    expect(result.ok).toBe(false);
  });

  it("splits on an explicit driver and returns the rounding remainder", () => {
    const result = splitByDriver(1000000n, [
      { id: "a", value: "1" },
      { id: "b", value: "1" },
      { id: "c", value: "1" },
    ], "opdrachten");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sum = result.parts.reduce((a, p) => a + p.minor, 0n);
      expect(sum + result.remainder).toBe(1000000n);
      expect(result.formula).toContain("Restant");
    }
  });

  it("requires explicit percentages", () => {
    expect(splitByPercent(1000000n, [{ id: "a", percent: null }]).ok).toBe(false);
    const result = splitByPercent(1000000n, [
      { id: "a", percent: "25" },
      { id: "b", percent: "25" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.remainder).toBe(500000n);
  });
});

describe("margin", () => {
  it("stays insufficient without financial lines", () => {
    expect(marginView([], []).kind).toBe("insufficient");
  });

  it("shows costs only when revenue is absent", () => {
    const view = marginView([line({ id: "a", amount: "80" }), line({ id: "b", amount: "20" })], []);
    expect(view.kind).toBe("costs_only");
  });

  it("blocks a margin across mixed currencies", () => {
    const view = marginView(
      [line({ id: "a", amount: "80" }), line({ id: "b", amount: "100", isRevenue: true, currency: "USD" })],
      [],
    );
    expect(view.kind).toBe("blocked");
  });

  it("computes a margin only from confirmed revenue and cost in one scope", () => {
    const view = marginView(
      [
        line({ id: "cost", amount: "40" }),
        line({ id: "rev", amount: "100", isRevenue: true }),
      ],
      [],
    );
    expect(view.kind).toBe("margin");
    if (view.kind === "margin") {
      expect(view.resultMinor).toBe(600000n);
      expect(view.formula).toContain("geen cashflow");
    }
  });

  it("does not treat unconfirmed figures as a final margin", () => {
    const view = marginView(
      [
        line({ id: "cost", amount: "40", status: "proposed" }),
        line({ id: "rev", amount: "100", isRevenue: true }),
      ],
      [],
    );
    expect(view.kind).toBe("blocked");
  });

  it("refuses an activity margin without a confirmed revenue assignment", () => {
    const view = activityMargin(
      "act",
      [line({ id: "rev", amount: "100", isRevenue: true })],
      [{ lineId: "rev", activityId: "act", amount: "100", status: "proposed" }],
    );
    expect(view.kind).toBe("blocked");
  });
});

describe("time to cost", () => {
  it("requires a confirmed rate and matching unit", () => {
    expect(timeToCost("3", "hour", "80", "hour", false)).toHaveProperty("error");
    expect(timeToCost("3", "hour", "80", "day", true)).toHaveProperty("error");
    expect(timeToCost(null, "hour", "80", "hour", true)).toHaveProperty("error");
    expect(timeToCost("2", "hour", "80", "hour", true)).toEqual({ minor: 1600000n });
  });
});

describe("csv", () => {
  it("keeps quoted separators and marks totals, formulas and duplicates", () => {
    const { rows } = parseCsv('code;omschrijving;bedrag\n6100;"Huur, kantoor";1.200,00\n;Totaal;1.200,00\n6100;"Huur, kantoor";1.200,00\n;Formule;=A1\n');
    const mapped = mapCsvLines(rows, { code: 0, description: 1, amount: 2 }, "comma");
    expect(mapped[0]?.description).toBe("Huur, kantoor");
    expect(mapped[0]?.amount).toBe("1200");
    expect(mapped[1]?.kind).toBe("total");
    expect(mapped[2]?.possibleDuplicate).toBe(true);
    expect(mapped[3]?.formula).toBe(true);
    expect(mapped[3]?.amount).toBeNull();
  });
});
