import { describe, expect, it } from "vitest";
import { exampleFirstMarketerWorkflow, exampleInsightsOnlyWorkflow } from "@/lib/salesbrain/graph/example-first-marketer";
import { canConnectNodeTypes, validateEdgePorts } from "@/lib/salesbrain/graph/port-compat";

describe("port-compat", () => {
  it("allows valid edges in first marketer workflow", () => {
    const def = exampleFirstMarketerWorkflow();
    expect(validateEdgePorts(def.nodes, def.edges)).toHaveLength(0);
  });

  it("allows insights-only connector workflow", () => {
    const def = exampleInsightsOnlyWorkflow();
    expect(validateEdgePorts(def.nodes, def.edges)).toHaveLength(0);
  });

  it("rejects website_fetch to normalize", () => {
    expect(canConnectNodeTypes("website_fetch", "normalize")).toBe(false);
  });
});
