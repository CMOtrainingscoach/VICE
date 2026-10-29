import { defaultNodeData, type SurveyDefinition, type SurveyNode, type SurveyNodeType } from "@/lib/survey/survey-types";

const NODE_TYPES = new Set<SurveyNodeType>([
  "welcome",
  "title_screen",
  "thank_you",
  "short_text",
  "long_text",
  "multiple_choice",
  "dropdown",
  "radio",
  "rating",
  "contact",
]);

export function normalizeSurveyPosition(raw: unknown): { x: number; y: number } {
  if (!raw || typeof raw !== "object") return { x: 0, y: 0 };
  const row = raw as Record<string, unknown>;
  const x = Number(row.x);
  const y = Number(row.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

export function normalizeSurveyNode(raw: unknown, index: number): SurveyNode | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;

  const typeRaw = String(row.type ?? "title_screen");
  const type = NODE_TYPES.has(typeRaw as SurveyNodeType) ? (typeRaw as SurveyNodeType) : "title_screen";

  const dataRaw = row.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {};
  const defaults = defaultNodeData(type);

  return {
    id,
    type,
    position: normalizeSurveyPosition(row.position ?? { x: 80 + index * 40, y: 120 + index * 80 }),
    data: {
      ...defaults,
      screenTitle: String(dataRaw.screenTitle ?? defaults.screenTitle ?? ""),
      screenDescription: String(dataRaw.screenDescription ?? defaults.screenDescription ?? ""),
      questionLabel: dataRaw.questionLabel != null ? String(dataRaw.questionLabel) : defaults.questionLabel,
      buttonLabel: dataRaw.buttonLabel != null ? String(dataRaw.buttonLabel) : defaults.buttonLabel,
      required: dataRaw.required === true,
      options: Array.isArray(dataRaw.options) ? (dataRaw.options as SurveyNode["data"]["options"]) : defaults.options,
      scaleMin: dataRaw.scaleMin != null ? Number(dataRaw.scaleMin) : defaults.scaleMin,
      scaleMax: dataRaw.scaleMax != null ? Number(dataRaw.scaleMax) : defaults.scaleMax,
      scaleMinLabel: dataRaw.scaleMinLabel != null ? String(dataRaw.scaleMinLabel) : defaults.scaleMinLabel,
      scaleMaxLabel: dataRaw.scaleMaxLabel != null ? String(dataRaw.scaleMaxLabel) : defaults.scaleMaxLabel,
    },
  };
}

export function normalizeSurveyDefinition(raw: unknown): SurveyDefinition {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nodesRaw = Array.isArray(row.nodes) ? row.nodes : [];
  const nodes = nodesRaw
    .map((n, i) => normalizeSurveyNode(n, i))
    .filter((n): n is SurveyNode => n !== null);

  const edgesRaw = Array.isArray(row.edges) ? row.edges : [];
  const edges = edgesRaw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const edge = e as Record<string, unknown>;
      const source = String(edge.source ?? "");
      const target = String(edge.target ?? "");
      if (!source || !target) return null;
      return {
        id: String(edge.id ?? crypto.randomUUID()),
        source,
        target,
        sourceHandle: edge.sourceHandle != null ? String(edge.sourceHandle) : null,
        label: edge.label != null ? String(edge.label) : undefined,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    version: Number(row.version ?? 1),
    nodes,
    edges,
    settings: (row.settings && typeof row.settings === "object"
      ? row.settings
      : {}) as SurveyDefinition["settings"],
  };
}

export function surveyDefinitionStructureKey(def: SurveyDefinition): string {
  const nodes = def.nodes
    .map((n) => {
      const opts = (n.data.options ?? []).map((o) => `${o.id}:${o.label}`).join(",");
      return `${n.id}|${n.type}|${n.data.screenTitle}|${n.data.questionLabel ?? ""}|${opts}`;
    })
    .join(";");
  const edges = def.edges.map((e) => `${e.id}|${e.source}|${e.target}|${e.sourceHandle ?? ""}`).join(";");
  return `${nodes}::${edges}`;
}
