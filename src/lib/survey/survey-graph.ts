import {
  isBranchingQuestion,
  isQuestionNode,
  type SurveyDefinition,
  type SurveyEdge,
  type SurveyNode,
} from "@/lib/survey/survey-types";

export function validateSurveyDefinition(def: SurveyDefinition): string | null {
  const nodes = def.nodes ?? [];
  const edges = def.edges ?? [];

  const welcomeNodes = nodes.filter((n) => n.type === "welcome");
  if (welcomeNodes.length !== 1) {
    return "Er moet precies één Welkom-scherm in de flow staan.";
  }

  const thankNodes = nodes.filter((n) => n.type === "thank_you");
  if (thankNodes.length === 0) {
    return "Voeg minstens één Bedankpagina toe.";
  }

  for (const thank of thankNodes) {
    const out = edges.filter((e) => e.source === thank.id);
    if (out.length > 0) {
      return "Bedankpagina's mogen geen uitgaande verbindingen hebben.";
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return "Een verbinding verwijst naar een onbekend scherm.";
    }
  }

  const welcomeId = welcomeNodes[0]!.id;
  const reachable = reachableFrom(welcomeId, nodes, edges);
  const unreachableThank = thankNodes.some((t) => !reachable.has(t.id));
  if (unreachableThank) {
    return "Niet elke Bedankpagina is bereikbaar vanaf Welkom.";
  }

  for (const node of nodes) {
    if (node.type === "thank_you") continue;
    if (!reachable.has(node.id)) {
      return `Scherm "${node.data.screenTitle || node.type}" is niet bereikbaar.`;
    }
    const out = edges.filter((e) => e.source === node.id);
    if (out.length === 0) {
      return `Scherm "${node.data.screenTitle || node.type}" heeft geen vervolgstap.`;
    }
  }

  for (const node of nodes) {
    if (isQuestionNode(node.type) && node.data.required && !node.data.questionLabel?.trim()) {
      return "Verplichte vragen moeten een vraagtekst hebben.";
    }
    if (isBranchingQuestion(node.type)) {
      const opts = node.data.options ?? [];
      if (opts.length < 2) {
        return `"${node.data.screenTitle || nodeTypeShort(node)}" heeft minstens 2 antwoordopties nodig.`;
      }
    }
  }

  return null;
}

function nodeTypeShort(node: SurveyNode): string {
  return node.type;
}

function reachableFrom(startId: string, nodes: SurveyNode[], edges: SurveyEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

export function findWelcomeNode(def: SurveyDefinition): SurveyNode | null {
  return def.nodes.find((n) => n.type === "welcome") ?? null;
}

export function resolveNextNodeId(
  def: SurveyDefinition,
  currentId: string,
  answer: unknown,
): string | null {
  const edges = def.edges.filter((e) => e.source === currentId);
  if (edges.length === 0) return null;

  const node = def.nodes.find((n) => n.id === currentId);
  if (node && isBranchingQuestion(node.type) && typeof answer === "string") {
    const matched = edges.find((e) => e.sourceHandle === answer);
    if (matched) return matched.target;
    const defaultEdge = edges.find((e) => !e.sourceHandle);
    if (defaultEdge) return defaultEdge.target;
  }

  if (Array.isArray(answer) && node?.type === "multiple_choice") {
    const first = answer[0];
    if (typeof first === "string") {
      const matched = edges.find((e) => e.sourceHandle === first);
      if (matched) return matched.target;
    }
  }

  return edges[0]?.target ?? null;
}
