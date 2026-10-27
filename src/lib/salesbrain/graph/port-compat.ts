import type { SbGraphNode, SbGraphEdge } from "@/lib/salesbrain/graph/types";
import { NODE_INPUT_PORTS, NODE_OUTPUT_PORT } from "@/lib/salesbrain/graph/types";
import type { SbNodeType } from "@/lib/salesbrain/types";

export function outputPortForNodeType(type: SbNodeType) {
  return NODE_OUTPUT_PORT[type];
}

export function canConnectNodeTypes(sourceType: SbNodeType, targetType: SbNodeType): boolean {
  const requiredInputs = NODE_INPUT_PORTS[targetType];
  if (!requiredInputs?.length) return true;
  const out = NODE_OUTPUT_PORT[sourceType];
  if (!out) return false;
  return requiredInputs.includes(out);
}

export function validateEdgePorts(nodes: SbGraphNode[], edges: SbGraphEdge[]): { edgeId: string; message: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues: { edgeId: string; message: string }[] = [];
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    if (!canConnectNodeTypes(source.type, target.type)) {
      issues.push({
        edgeId: edge.id,
        message: `Incompatibele poorten: ${source.label} → ${target.label}.`,
      });
    }
  }
  return issues;
}
