import type { SbWorkflowDefinition } from "@/lib/salesbrain/graph/types";
import { validateEdgePorts } from "@/lib/salesbrain/graph/port-compat";

export type GraphValidationIssue = { code: string; message: string; nodeId?: string };

export function validateWorkflowGraph(def: SbWorkflowDefinition): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodeIds = new Set(def.nodes.map((n) => n.id));

  if (!def.nodes.some((n) => n.type === "start")) {
    issues.push({ code: "missing_start", message: "Workflow heeft een startnode nodig." });
  }
  if (!def.nodes.some((n) => n.type === "results")) {
    issues.push({ code: "missing_output", message: "Minstens één resultaatnode is verplicht." });
  }

  for (const edge of def.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "dangling_edge", message: "Onbekende node in verbinding.", nodeId: edge.id });
    }
  }

  const adj = new Map<string, string[]>();
  for (const e of def.edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const next of adj.get(id) ?? []) {
      if (!dfs(next)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  for (const n of def.nodes) {
    if (!dfs(n.id)) {
      issues.push({ code: "cycle", message: "Workflow mag geen cycli bevatten (MVP)." });
      break;
    }
  }

  for (const portIssue of validateEdgePorts(def.nodes, def.edges)) {
    issues.push({ code: "incompatible_ports", message: portIssue.message, nodeId: portIssue.edgeId });
  }

  for (const node of def.nodes) {
    if (node.type === "newsletter") {
      issues.push({
        code: "deferred_node",
        message: "Newsletter-node is nog niet uitvoerbaar in gepubliceerde workflows.",
        nodeId: node.id,
      });
    }
  }

  return issues;
}

export function canPublish(def: SbWorkflowDefinition): boolean {
  const critical = validateWorkflowGraph(def).filter((i) => i.code !== "deferred_node");
  return critical.length === 0 && !def.nodes.some((n) => n.type === "newsletter");
}
