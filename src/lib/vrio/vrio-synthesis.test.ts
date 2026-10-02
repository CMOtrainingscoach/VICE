import { describe, expect, it } from "vitest";
import { restrainVrioSynthesis } from "@/lib/vrio/vrio-ai";

describe("restrainVrioSynthesis", () => {
  it("does not let a synthesis claim a sustained advantage the assessments do not have", () => {
    const text = "Dit levert een duurzaam concurrentievoordeel op, zelfs een potentieel duurzaam concurrentievoordeel.";
    const restrained = restrainVrioSynthesis(text, false);
    expect(restrained.toLowerCase()).not.toContain("duurzaam concurrentievoordeel");
  });

  it("keeps a sustained advantage when a resource was classified that way", () => {
    const text = "Er is een potentieel duurzaam concurrentievoordeel binnen deze context.";
    expect(restrainVrioSynthesis(text, true)).toBe(text);
  });
});
