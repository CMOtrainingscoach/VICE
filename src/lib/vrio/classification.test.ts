import { describe, expect, it } from "vitest";
import {
  classifyVrio,
  decisiveCriteria,
  emptyAnswers,
  isHypothetical,
  remainingCriteria,
  suggestedAction,
  type VrioAnswers,
} from "@/lib/vrio/classification";
import type { VrioAnswer } from "@/lib/vrio/constants";

function answers(v: VrioAnswer, r: VrioAnswer, i: VrioAnswer, o: VrioAnswer): VrioAnswers {
  return { value: v, rarity: r, imitability: i, organization: o };
}

describe("classifyVrio", () => {
  it("returns a competitive disadvantage when value is no", () => {
    expect(classifyVrio(answers("no", "yes", "yes", "yes"))).toBe("disadvantage");
  });

  it("returns parity for valuable but common resources", () => {
    expect(classifyVrio(answers("yes", "no", "yes", "yes"))).toBe("parity");
  });

  it("returns a temporary advantage when imitation is easy", () => {
    expect(classifyVrio(answers("yes", "yes", "no", "yes"))).toBe("temporary");
  });

  it("returns unused potential when the organisation cannot exploit it", () => {
    expect(classifyVrio(answers("yes", "yes", "yes", "no"))).toBe("unused_potential");
  });

  it("returns a potentially sustained advantage only when all four are yes", () => {
    expect(classifyVrio(answers("yes", "yes", "yes", "yes"))).toBe("sustained");
  });

  it("never treats unknown as no", () => {
    expect(classifyVrio(answers("unknown", "yes", "yes", "yes"))).toBe("undetermined");
    expect(classifyVrio(answers("yes", "unknown", "yes", "yes"))).toBe("undetermined");
    expect(classifyVrio(answers("yes", "yes", "unknown", "yes"))).toBe("undetermined");
    expect(classifyVrio(answers("yes", "yes", "yes", "unknown"))).toBe("undetermined");
  });

  it("never treats not assessed as no", () => {
    expect(classifyVrio(emptyAnswers())).toBe("undetermined");
    expect(classifyVrio(answers("yes", "not_assessed", "no", "no"))).toBe("undetermined");
  });

  it("allows skipping later criteria once the outcome is already decided", () => {
    expect(classifyVrio(answers("no", "not_assessed", "not_assessed", "not_assessed"))).toBe("disadvantage");
    expect(classifyVrio(answers("yes", "no", "not_assessed", "not_assessed"))).toBe("parity");
    expect(classifyVrio(answers("yes", "yes", "no", "not_assessed"))).toBe("temporary");
  });

  it("is deterministic across every answer combination", () => {
    const all: VrioAnswer[] = ["yes", "no", "unknown", "not_assessed"];
    for (const v of all) {
      for (const r of all) {
        for (const i of all) {
          for (const o of all) {
            const a = answers(v, r, i, o);
            expect(classifyVrio(a)).toBe(classifyVrio(a));
            if (v !== "yes" && v !== "no") expect(classifyVrio(a)).toBe("undetermined");
          }
        }
      }
    }
  });
});

describe("outcome explanation helpers", () => {
  it("names the criteria that decided the outcome", () => {
    expect(decisiveCriteria(answers("no", "yes", "yes", "yes"))).toEqual(["value"]);
    expect(decisiveCriteria(answers("yes", "no", "yes", "yes"))).toEqual(["value", "rarity"]);
    expect(decisiveCriteria(answers("yes", "yes", "yes", "yes"))).toHaveLength(4);
  });

  it("points to the first missing answer", () => {
    expect(remainingCriteria(answers("yes", "unknown", "yes", "yes"))).toEqual(["rarity"]);
    expect(remainingCriteria(answers("yes", "yes", "yes", "yes"))).toEqual([]);
  });

  it("suggests actions without deciding on investments", () => {
    expect(suggestedAction(answers("yes", "yes", "yes", "yes"))).toBe("protect");
    expect(suggestedAction(answers("yes", "yes", "yes", "no"))).toBe("organize");
    expect(suggestedAction(answers("yes", "no", "yes", "yes"))).toBe("substantiate");
    expect(suggestedAction(answers("no", "yes", "yes", "yes"))).toBe("reconsider");
  });

  it("keeps conclusions hypothetical when all evidence is hypothetical", () => {
    expect(isHypothetical(["hypothesis", "hypothesis"])).toBe(true);
    expect(isHypothetical(["hypothesis", "provided"])).toBe(false);
    expect(isHypothetical([])).toBe(true);
  });
});
