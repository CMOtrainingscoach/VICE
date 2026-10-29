"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SurveyFlowNode, type SurveyFlowNodeData } from "@/components/survey/survey-flow-node";
import {
  defaultNodeData,
  isBranchingQuestion,
  SURVEY_PALETTE,
  type SurveyDefinition,
  type SurveyEdge,
  type SurveyNode,
  type SurveyNodeType,
} from "@/lib/survey/survey-types";

const nodeTypes = { survey: SurveyFlowNode };

function toFlowNode(n: SurveyNode): Node {
  const data: SurveyFlowNodeData & { options?: SurveyNode["data"]["options"] } = {
    surveyType: n.type,
    title: n.data.screenTitle,
    subtitle:
      n.data.questionLabel ||
      (n.data.screenDescription ? n.data.screenDescription.slice(0, 60) : "") ||
      "",
    options: isBranchingQuestion(n.type) ? n.data.options : undefined,
  };
  return {
    id: n.id,
    type: "survey",
    position: n.position,
    data,
  };
}

function fromFlowNodes(nodes: Node[]): SurveyNode[] {
  return nodes.map((node) => {
    const d = node.data as SurveyFlowNodeData & { options?: SurveyNode["data"]["options"] };
    const existingType = d.surveyType;
    return {
      id: node.id,
      type: existingType,
      position: { x: node.position.x, y: node.position.y },
      data: {
        ...defaultNodeData(existingType),
        screenTitle: d.title,
        screenDescription: "",
        questionLabel: d.subtitle,
        ...(d.options ? { options: d.options } : {}),
      },
    };
  });
}

function mergeNodeData(oldNodes: SurveyNode[], flowNodes: Node[]): SurveyNode[] {
  const oldMap = new Map(oldNodes.map((n) => [n.id, n]));
  return flowNodes.map((node) => {
    const prev = oldMap.get(node.id);
    const d = node.data as SurveyFlowNodeData;
    if (prev) {
      return {
        ...prev,
        position: { x: node.position.x, y: node.position.y },
        data: {
          ...prev.data,
          screenTitle: d.title || prev.data.screenTitle,
        },
      };
    }
    const type = d.surveyType;
    return {
      id: node.id,
      type,
      position: { x: node.position.x, y: node.position.y },
      data: defaultNodeData(type),
    };
  });
}

function toFlowEdges(edges: SurveyEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    label: e.label,
  }));
}

function fromFlowEdges(edges: Edge[]): SurveyEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    label: typeof e.label === "string" ? e.label : undefined,
  }));
}

export function SurveyFlowBuilder({
  definition,
  selectedNodeId,
  onDefinitionChange,
  onSelectNode,
}: {
  definition: SurveyDefinition;
  selectedNodeId: string | null;
  onDefinitionChange: (def: SurveyDefinition) => void;
  onSelectNode: (id: string | null) => void;
}) {
  const nodes = useMemo(
    () => definition.nodes.map((n) => ({
      ...toFlowNode(n),
      selected: n.id === selectedNodeId,
    })),
    [definition.nodes, selectedNodeId],
  );
  const edges = useMemo(() => toFlowEdges(definition.edges), [definition.edges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const nextFlow = applyNodeChanges(changes, nodes);
      const merged = mergeNodeData(definition.nodes, nextFlow);
      onDefinitionChange({ ...definition, nodes: merged });
      for (const ch of changes) {
        if (ch.type === "select" && ch.selected) onSelectNode(ch.id);
        if (ch.type === "select" && !ch.selected && selectedNodeId === ch.id) onSelectNode(null);
      }
    },
    [definition, nodes, onDefinitionChange, onSelectNode, selectedNodeId],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const next = applyEdgeChanges(changes, edges);
      onDefinitionChange({ ...definition, edges: fromFlowEdges(next) });
    },
    [definition, edges, onDefinitionChange],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const next = addEdge(
        {
          ...connection,
          id: crypto.randomUUID(),
        },
        edges,
      );
      onDefinitionChange({ ...definition, edges: fromFlowEdges(next) });
    },
    [definition, edges, onDefinitionChange],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/survey-node") as SurveyNodeType;
      if (!type) return;
      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const x = event.clientX - bounds.left - 90;
      const y = event.clientY - bounds.top - 40;
      const id = crypto.randomUUID();
      const newNode: SurveyNode = {
        id,
        type,
        position: { x, y },
        data: defaultNodeData(type),
      };
      onDefinitionChange({
        ...definition,
        nodes: [...definition.nodes, newNode],
      });
      onSelectNode(id);
    },
    [definition, onDefinitionChange, onSelectNode],
  );

  return (
    <div className="flex min-h-[520px] gap-0 overflow-hidden rounded-xl border border-vice-border bg-vice-bg">
      <aside className="w-44 shrink-0 space-y-3 border-r border-vice-border bg-vice-surface p-3">
        <p className="text-xs font-medium uppercase text-vice-text-muted">Schermen</p>
        {SURVEY_PALETTE.filter((p) => p.group === "screen").map((item) => (
          <PaletteItem key={item.type} type={item.type} label={item.label} />
        ))}
        <p className="pt-2 text-xs font-medium uppercase text-vice-text-muted">Vragen</p>
        {SURVEY_PALETTE.filter((p) => p.group === "question").map((item) => (
          <PaletteItem key={item.type} type={item.type} label={item.label} />
        ))}
      </aside>
      <div
        className="min-h-[520px] flex-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          onPaneClick={() => onSelectNode(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

function PaletteItem({ type, label }: { type: SurveyNodeType; label: string }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/survey-node", type);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cursor-grab rounded-md border border-dashed border-vice-border bg-vice-bg px-2 py-1.5 text-xs text-vice-text hover:border-vice-gold active:cursor-grabbing"
    >
      {label}
    </div>
  );
}

/** Sync inspector edits back into definition */
export function patchSurveyNode(definition: SurveyDefinition, node: SurveyNode): SurveyDefinition {
  return {
    ...definition,
    nodes: definition.nodes.map((n) => (n.id === node.id ? node : n)),
  };
}

export function getSurveyNode(definition: SurveyDefinition, id: string | null): SurveyNode | null {
  if (!id) return null;
  return definition.nodes.find((n) => n.id === id) ?? null;
}
