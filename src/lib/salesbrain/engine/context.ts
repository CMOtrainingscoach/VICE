import type { SbGraphNode } from "@/lib/salesbrain/graph/types";

export type SbExecutionContext = {
  tenantId: string;
  runId: string;
  isTest: boolean;
  inputs: Record<string, unknown>;
  pinned: {
    icpSnapshot?: Record<string, unknown>;
    lat: number;
    lng: number;
    radiusKm: number;
    locationLabel: string;
    goalText: string;
  };
  artifacts: Map<string, unknown>;
  warnings: string[];
};

export function topoSort(nodes: SbGraphNode[], edges: { source: string; target: string }[]): SbGraphNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) indegree.set(id, 0);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: SbGraphNode[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (node) order.push(node);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order.length === nodes.length ? order : nodes;
}
