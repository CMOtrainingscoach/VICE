import { describe, expect, it } from "vitest";
import { resolveNextNodeId, validateSurveyDefinition } from "@/lib/survey/survey-graph";
import type { SurveyDefinition } from "@/lib/survey/survey-types";

describe("validateSurveyDefinition", () => {
  it("requires exactly one welcome", () => {
    const def: SurveyDefinition = {
      version: 1,
      nodes: [],
      edges: [],
      settings: {},
    };
    expect(validateSurveyDefinition(def)).toMatch(/Welkom/);
  });
});

describe("resolveNextNodeId", () => {
  it("follows option handle", () => {
    const def: SurveyDefinition = {
      version: 1,
      settings: {},
      nodes: [
        { id: "w", type: "welcome", position: { x: 0, y: 0 }, data: { screenTitle: "", screenDescription: "" } },
        {
          id: "q",
          type: "radio",
          position: { x: 0, y: 0 },
          data: {
            screenTitle: "",
            screenDescription: "",
            questionLabel: "",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
          },
        },
        { id: "t1", type: "thank_you", position: { x: 0, y: 0 }, data: { screenTitle: "", screenDescription: "" } },
        { id: "t2", type: "thank_you", position: { x: 0, y: 0 }, data: { screenTitle: "", screenDescription: "" } },
      ],
      edges: [
        { id: "e1", source: "w", target: "q" },
        { id: "e2", source: "q", target: "t1", sourceHandle: "a" },
        { id: "e3", source: "q", target: "t2", sourceHandle: "b" },
      ],
    };
    expect(resolveNextNodeId(def, "q", "a")).toBe("t1");
    expect(resolveNextNodeId(def, "q", "b")).toBe("t2");
  });
});
