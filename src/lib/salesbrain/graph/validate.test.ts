import { describe, expect, it } from "vitest";
import { exampleFirstMarketerWorkflow, exampleInsightsOnlyWorkflow } from "@/lib/salesbrain/graph/example-first-marketer";
import { canPublish, validateWorkflowGraph } from "@/lib/salesbrain/graph/validate";

describe("validateWorkflowGraph", () => {
  it("accepts example first marketer workflow", () => {
    const def = exampleFirstMarketerWorkflow();
    const issues = validateWorkflowGraph(def);
    const critical = issues.filter((i) => i.code !== "deferred_node");
    expect(critical).toHaveLength(0);
    expect(canPublish(def)).toBe(true);
  });

  it("accepts insights-only workflow", () => {
    const def = exampleInsightsOnlyWorkflow();
    const critical = validateWorkflowGraph(def).filter((i) => i.code !== "deferred_node");
    expect(critical).toHaveLength(0);
    expect(canPublish(def)).toBe(true);
  });

  it("rejects graph without results node", () => {
    const def = exampleFirstMarketerWorkflow();
    def.nodes = def.nodes.filter((n) => n.type !== "results");
    expect(validateWorkflowGraph(def).some((i) => i.code === "missing_output")).toBe(true);
  });
});
