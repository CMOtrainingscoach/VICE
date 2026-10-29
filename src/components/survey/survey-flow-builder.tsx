"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SurveyFlowNode, type SurveyFlowNodeData } from "@/components/survey/survey-flow-node";
import { normalizeSurveyPosition, surveyDefinitionStructureKey } from "@/lib/survey/survey-parse";
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

const SURVEY_DRAG_MIME = "application/survey-node";

function toFlowNode(n: SurveyNode, selected: boolean): Node<SurveyFlowNodeData> {
  const pos = normalizeSurveyPosition(n.position);
  return {
    id: n.id,
    type: "survey",
    position: pos,
    data: {
      surveyType: n.type,
      title: n.data.screenTitle,
      subtitle:
        n.data.questionLabel ||
        (n.data.screenDescription ? n.data.screenDescription.slice(0, 60) : "") ||
        "",
      options: isBranchingQuestion(n.type) ? n.data.options : undefined,
    },
    draggable: true,
    selectable: true,
    selected,
  };
}

function definitionToFlow(definition: SurveyDefinition, selectedNodeId: string | null) {
  return {
    nodes: definition.nodes.map((n) => toFlowNode(n, n.id === selectedNodeId)),
    edges: definition.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      label: e.label,
    })),
  };
}

function mergeNodeData(oldNodes: SurveyNode[], flowNodes: Node[]): SurveyNode[] {
  const oldMap = new Map(oldNodes.map((n) => [n.id, n]));
  return flowNodes.map((node) => {
    const prev = oldMap.get(node.id);
    const d = node.data as SurveyFlowNodeData;
    const pos = normalizeSurveyPosition(node.position);
    if (prev) {
      // Canvas nodes only drive position; content (options, labels) lives in definition.
      return { ...prev, position: pos };
    }
    return {
      id: node.id,
      type: d.surveyType,
      position: pos,
      data: defaultNodeData(d.surveyType),
    };
  });
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

function SurveyFlowCanvas({
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
  const { screenToFlowPosition, fitView } = useReactFlow();
  const structureKey = useMemo(() => surveyDefinitionStructureKey(definition), [definition]);
  const lastStructureKey = useRef(structureKey);
  const lastSelection = useRef(selectedNodeId);

  const initial = useMemo(() => definitionToFlow(definition, selectedNodeId), []);
  const [rfNodes, setRfNodes] = useNodesState(initial.nodes);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>(initial.edges);

  useEffect(() => {
    const structureChanged = structureKey !== lastStructureKey.current;
    const selectionChanged = selectedNodeId !== lastSelection.current;
    lastStructureKey.current = structureKey;
    lastSelection.current = selectedNodeId;

    if (structureChanged) {
      const next = definitionToFlow(definition, selectedNodeId);
      setRfNodes(next.nodes);
      setRfEdges(next.edges);
      requestAnimationFrame(() => {
        void fitView({ padding: 0.25, duration: 250 });
      });
      return;
    }

    if (selectionChanged) {
      setRfNodes((nodes) =>
        nodes.map((n) => ({
          ...n,
          selected: n.id === selectedNodeId,
        })),
      );
    }
  }, [definition, structureKey, selectedNodeId, setRfNodes, setRfEdges, fitView]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setRfNodes((nodes) => {
        const next = applyNodeChanges(changes, nodes) as Node<SurveyFlowNodeData>[];
        const hasPosition = changes.some((c) => c.type === "position" && c.dragging === false);
        const hasRemove = changes.some((c) => c.type === "remove");
        if (hasPosition || hasRemove) {
          onDefinitionChange({
            ...definition,
            nodes: mergeNodeData(definition.nodes, next),
          });
        }
        return next;
      });
      for (const ch of changes) {
        if (ch.type === "select" && ch.selected) onSelectNode(ch.id);
        if (ch.type === "select" && !ch.selected && selectedNodeId === ch.id) onSelectNode(null);
      }
    },
    [definition, onDefinitionChange, onSelectNode, selectedNodeId, setRfNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setRfEdges((edges) => {
        const next = applyEdgeChanges(changes, edges) as Edge[];
        onDefinitionChange({ ...definition, edges: fromFlowEdges(next) });
        return next;
      });
    },
    [definition, onDefinitionChange, setRfEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setRfEdges((edges) => {
        const next = addEdge({ ...connection, id: crypto.randomUUID() }, edges);
        onDefinitionChange({ ...definition, edges: fromFlowEdges(next) });
        return next;
      });
    },
    [definition, onDefinitionChange, setRfEdges],
  );

  const addNodeAt = useCallback(
    (type: SurveyNodeType, clientX: number, clientY: number) => {
      const position = screenToFlowPosition({ x: clientX, y: clientY });
      const id = crypto.randomUUID();
      const newNode: SurveyNode = {
        id,
        type,
        position,
        data: defaultNodeData(type),
      };
      onDefinitionChange({
        ...definition,
        nodes: [...definition.nodes, newNode],
      });
      onSelectNode(id);
    },
    [definition, onDefinitionChange, onSelectNode, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = (event.dataTransfer.getData(SURVEY_DRAG_MIME) ||
        event.dataTransfer.getData("text/plain")) as SurveyNodeType;
      if (!type || !SURVEY_PALETTE.some((p) => p.type === type)) return;
      addNodeAt(type, event.clientX, event.clientY);
    },
    [addNodeAt],
  );

  return (
    <ReactFlow
      className="survey-flow-canvas bg-vice-bg"
      style={{ width: "100%", height: "100%" }}
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      nodesDraggable
      nodesConnectable
      edgesReconnectable
      edgesFocusable
      elementsSelectable
      deleteKeyCode={["Backspace", "Delete"]}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onPaneClick={() => onSelectNode(null)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "smoothstep" }}
    >
      <Background gap={16} color="var(--vice-border)" />
      <Controls className="!border-vice-border !bg-vice-surface !shadow-sm [&>button]:!border-vice-border [&>button]:!bg-vice-surface [&>button]:!fill-vice-text" />
      <MiniMap
        className="!border-vice-border !bg-vice-surface"
        nodeColor="var(--vice-gold)"
        maskColor="color-mix(in srgb, var(--vice-bg) 75%, transparent)"
      />
    </ReactFlow>
  );
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
  const addFromPalette = useCallback(
    (type: SurveyNodeType) => {
      const id = crypto.randomUUID();
      const offset = definition.nodes.length * 24;
      const newNode: SurveyNode = {
        id,
        type,
        position: { x: 120 + offset, y: 160 + offset },
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
    <div className="survey-flow-panel flex min-h-[560px] gap-0 overflow-hidden rounded-xl border border-vice-border bg-vice-bg">
      <aside className="z-10 w-48 shrink-0 overflow-y-auto border-r border-vice-border bg-vice-surface p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-vice-text">Schermen</p>
        <p className="mb-2 text-[11px] leading-snug text-vice-text-muted">
          Sleep naar het canvas of klik +. Verbind schermen zelf via de gouden puntjes—geen automatische
          verbindingen.
        </p>
        <div className="space-y-2">
          {SURVEY_PALETTE.filter((p) => p.group === "screen").map((item) => (
            <PaletteItem key={item.type} type={item.type} label={item.label} onAdd={() => addFromPalette(item.type)} />
          ))}
        </div>
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-vice-text">Vragen</p>
        <div className="space-y-2">
          {SURVEY_PALETTE.filter((p) => p.group === "question").map((item) => (
            <PaletteItem key={item.type} type={item.type} label={item.label} onAdd={() => addFromPalette(item.type)} />
          ))}
        </div>
      </aside>
      <div className="relative h-[560px] min-w-0 flex-1">
        <ReactFlowProvider>
          <SurveyFlowCanvas
            definition={definition}
            selectedNodeId={selectedNodeId}
            onDefinitionChange={onDefinitionChange}
            onSelectNode={onSelectNode}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

function PaletteItem({
  type,
  label,
  onAdd,
}: {
  type: SurveyNodeType;
  label: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-stretch gap-1">
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SURVEY_DRAG_MIME, type);
          e.dataTransfer.setData("text/plain", type);
          e.dataTransfer.effectAllowed = "move";
        }}
        className="flex flex-1 cursor-grab items-center rounded-md border border-vice-border bg-vice-bg px-2.5 py-2 text-sm font-medium text-vice-text shadow-sm hover:border-vice-gold active:cursor-grabbing"
        title="Sleep naar het canvas"
      >
        {label}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md border border-vice-border bg-vice-surface px-2 text-sm font-medium text-vice-gold hover:border-vice-gold"
        title="Toevoegen op canvas"
        aria-label={`${label} toevoegen`}
        onClick={onAdd}
      >
        +
      </button>
    </div>
  );
}

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
