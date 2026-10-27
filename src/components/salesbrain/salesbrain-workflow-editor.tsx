"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { sbFlowNodeTypes } from "@/components/salesbrain/flow/sb-flow-node";
import { SbNodeInspector } from "@/components/salesbrain/flow/sb-node-inspector";
import { SbPalette } from "@/components/salesbrain/flow/sb-palette";
import { exampleFirstMarketerFormSchema, exampleFirstMarketerWorkflow } from "@/lib/salesbrain/graph/example-first-marketer";
import type { SbGraphNode } from "@/lib/salesbrain/graph/types";
import { canConnectNodeTypes } from "@/lib/salesbrain/graph/port-compat";
import type { SbWorkflowDefinition } from "@/lib/salesbrain/graph/types";
import { validateWorkflowGraph } from "@/lib/salesbrain/graph/validate";
import { buildEvalHarness } from "@/lib/salesbrain/eval-harness";
import { NODE_REGISTRY } from "@/lib/salesbrain/nodes/registry";
import type { SbNodeType } from "@/lib/salesbrain/types";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import {
  publishWorkflowGraphAction,
  saveWorkflowDraftAction,
  updateSbWorkflowMetaAction,
} from "@/modules/salesbrain/actions";

const COMPACT_NODE_TYPES = new Set<SbNodeType>(["client_context", "website_fetch", "normalize"]);

function graphToFlowNodes(graphNodes: SbGraphNode[], selectedId: string | null): Node[] {
  return graphNodes.map((n, i) => ({
    id: n.id,
    type: "sb",
    position: n.position ?? { x: (i % 3) * 220, y: Math.floor(i / 3) * 120 },
    data: {
      label: n.label,
      nodeType: n.type,
      selected: n.id === selectedId,
      compact: COMPACT_NODE_TYPES.has(n.type),
    },
    selected: n.id === selectedId,
  }));
}

function toFlowEdges(def: SbWorkflowDefinition): Edge[] {
  return def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    style: { stroke: "var(--vice-gold)", strokeWidth: 2 },
  }));
}

function definitionFromState(graphNodes: SbGraphNode[], nodes: Node[], edges: Edge[]): SbWorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: graphNodes.map((n) => {
      const flow = nodes.find((fn) => fn.id === n.id);
      return {
        ...n,
        position: flow?.position ?? n.position,
      };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

export function SalesbrainWorkflowEditor({
  tenantId,
  tenantName,
  workflowId,
  workflowTitle = "Vind bedrijven met groeisignalen",
  workflowPurpose = "",
  initialDefinition,
  readOnly = false,
}: {
  tenantId: string;
  tenantName?: string;
  workflowId: string;
  workflowTitle?: string;
  workflowPurpose?: string;
  initialDefinition?: SbWorkflowDefinition;
  readOnly?: boolean;
}) {
  const base = useMemo(() => initialDefinition ?? exampleFirstMarketerWorkflow(), [initialDefinition]);
  const formSchema = useMemo(() => exampleFirstMarketerFormSchema(), []);
  const [graphNodes, setGraphNodes] = useState<SbGraphNode[]>(base.nodes);
  const [title, setTitle] = useState(workflowTitle);
  const [purpose, setPurpose] = useState(workflowPurpose);
  const [selectedId, setSelectedId] = useState<string | null>("jobs");
  const [nodes, setNodes, onNodesChange] = useNodesState(graphToFlowNodes(base.nodes, "jobs"));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(base));
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"workflow" | "client" | "runs">("workflow");
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeTypeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n.type])), [graphNodes]);
  const selectedGraphNode = graphNodes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    setNodes(graphToFlowNodes(graphNodes, selectedId));
  }, [graphNodes, selectedId, setNodes]);

  const pushHistory = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      setHistory((h) => [...h.slice(0, historyIndex + 1), { nodes: nextNodes, edges: nextEdges }].slice(-30));
      setHistoryIndex((i) => Math.min(i + 1, 29));
    },
    [historyIndex],
  );

  const scheduleAutosave = useCallback(
    (def: SbWorkflowDefinition) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveWorkflowDraftAction(tenantId, workflowId, def, formSchema);
      }, 2000);
    },
    [tenantId, workflowId, formSchema],
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const sourceType = nodeTypeById.get(connection.source ?? "");
      const targetType = nodeTypeById.get(connection.target ?? "");
      if (!sourceType || !targetType) return false;
      return canConnectNodeTypes(sourceType, targetType);
    },
    [nodeTypeById],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        setMessage("Deze poorten zijn niet compatibel.");
        return;
      }
      setEdges((eds) => {
        const next = addEdge({ ...connection, type: "smoothstep", style: { stroke: "var(--vice-gold)", strokeWidth: 2 } }, eds);
        pushHistory(nodes, next);
        scheduleAutosave(definitionFromState(graphNodes, nodes, next));
        return next;
      });
    },
    [graphNodes, isValidConnection, nodes, pushHistory, scheduleAutosave, setEdges],
  );

  useEffect(() => {
    setGraphNodes(base.nodes);
    setEdges(toFlowEdges(base));
    setNodes(graphToFlowNodes(base.nodes, selectedId));
    setTitle(workflowTitle);
    setPurpose(workflowPurpose);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when workflow file changes
  }, [base, workflowTitle, workflowPurpose]);

  useEffect(() => {
    pushHistory(toFlowNodes(graphNodes, selectedId), toFlowEdges(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed undo stack once
  }, []);

  function onNodeConfigChange(nodeId: string, patch: Record<string, unknown>) {
    setGraphNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n)),
    );
    const def = definitionFromState(
      graphNodes.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n)),
      nodes,
      edges,
    );
    scheduleAutosave(def);
  }

  function onPalettePick(type: SbNodeType) {
    const match = graphNodes.find((n) => n.type === type);
    if (match) {
      setSelectedId(match.id);
      setMessage("");
    } else {
      setMessage(`Node «${type}» staat nog niet in deze workflow.`);
    }
  }

  function undo() {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    if (!prev) return;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryIndex((i) => i - 1);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    if (!next) return;
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryIndex((i) => i + 1);
  }

  async function onPublish() {
    if (readOnly) return;
    await updateSbWorkflowMetaAction(tenantId, workflowId, title, purpose);
    const def = definitionFromState(graphNodes, nodes, edges);
    const issues = validateWorkflowGraph(def);
    if (issues.some((i) => i.code !== "deferred_node")) {
      setMessage(issues[0]?.message ?? "Validatiefout");
      return;
    }
    const result = await publishWorkflowGraphAction(tenantId, workflowId, def, formSchema);
    setMessage(result.ok ? "Gepubliceerd." : result.error);
  }

  const validationIssues = validateWorkflowGraph(definitionFromState(graphNodes, nodes, edges));
  const evalHarness = useMemo(() => buildEvalHarness(), []);
  const basePath = leadgenBasePath(tenantId);

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col rounded-xl border border-vice-border bg-vice-bg">
      <header className="border-b border-vice-border px-6 py-4">
        <p className="text-sm text-vice-text-muted">
          {tenantName ?? "Klant"} / Salesbrain / Workflow
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            {readOnly ? (
              <>
                <h1 className="font-display text-2xl text-vice-text">{title}</h1>
                <p className="mt-1 text-sm text-amber-700">Gearchiveerd — alleen bekijken. Herstel via Workflows-lijst.</p>
              </>
            ) : (
              <>
                <input
                  className="font-display w-full max-w-xl bg-transparent text-2xl text-vice-text outline-none border-b border-transparent focus:border-vice-gold"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => void updateSbWorkflowMetaAction(tenantId, workflowId, title, purpose)}
                  aria-label="Workflownaam"
                />
                <input
                  className="mt-2 w-full max-w-xl bg-transparent text-sm text-vice-text-muted outline-none"
                  value={purpose}
                  placeholder="Doel van deze workflow"
                  onChange={(e) => setPurpose(e.target.value)}
                  onBlur={() => void updateSbWorkflowMetaAction(tenantId, workflowId, title, purpose)}
                  aria-label="Workflowdoel"
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" asChild>
              <Link href={`${basePath}/workflows`}>Alle workflows</Link>
            </Button>
            <Button type="button" variant="secondary" asChild>
              <Link href={`${basePath}/start/${workflowId}?test=1`}>Preview</Link>
            </Button>
            <Button type="button" disabled={readOnly} onClick={() => void onPublish()}>
              Publiceren
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-b border-vice-border pb-0 text-sm">
          {(["workflow", "client", "runs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`border-b-2 px-1 pb-2 ${tab === t ? "border-vice-gold text-vice-text" : "border-transparent text-vice-text-muted"}`}
              onClick={() => setTab(t)}
            >
              {t === "workflow" ? "Workflow" : t === "client" ? "Klantervaring" : "Uitvoeringen"}
            </button>
          ))}
          <div className="ml-auto flex gap-2 pb-2">
            <Button type="button" variant="ghost" className="text-xs" onClick={undo}>
              Ongedaan
            </Button>
            <Button type="button" variant="ghost" className="text-xs" onClick={redo}>
              Opnieuw
            </Button>
          </div>
        </div>
      </header>

      {message ? (
        <p className="px-6 py-2 text-sm text-vice-text-muted" role="status">
          {message}
        </p>
      ) : null}
      {validationIssues.length ? (
        <p className="px-6 py-1 text-xs text-amber-700" role="status">
          {validationIssues[0]?.message}
        </p>
      ) : null}

      {tab === "workflow" ? (
        <div className="flex min-h-0 flex-1">
          <SbPalette onPickType={onPalettePick} />
          <div className="relative min-w-0 flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={sbFlowNodeTypes}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable
              onNodesChange={readOnly ? undefined : onNodesChange}
              onEdgesChange={readOnly ? undefined : onEdgesChange}
              onConnect={readOnly ? undefined : onConnect}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              isValidConnection={isValidConnection}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "var(--vice-gold)", strokeWidth: 2 } }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--vice-border)" />
              <Controls className="!border-vice-border !bg-vice-surface !shadow-sm" />
            </ReactFlow>
          </div>
          <SbNodeInspector node={selectedGraphNode} onChange={onNodeConfigChange} />
        </div>
      ) : null}

      {tab === "client" ? (
        <div className="space-y-4 p-6 text-sm">
          <p className="text-vice-text-muted">Formulier-mapping (gepubliceerde versie):</p>
          <ol className="list-decimal space-y-2 pl-5">
            {formSchema.steps.map((step) => (
              <li key={step.id}>
                <span className="font-medium capitalize">{step.id}</span>
                {step.fields.length ? (
                  <ul className="mt-1 list-disc pl-5 text-vice-text-muted">
                    {step.fields.map((f) => (
                      <li key={f.key}>
                        {f.label} ({f.type}){f.required ? " *" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-vice-text-muted"> — geen velden</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {tab === "runs" ? (
        <div className="space-y-2 p-6 text-sm text-vice-text-muted">
          <p>Node-catalogus en readiness:</p>
          <ul className="mt-2 space-y-1">
            {NODE_REGISTRY.map((n) => (
              <li key={n.type}>
                {n.labelNl} — {n.readiness === "mvp" ? "MVP" : n.readiness === "phase3" ? "Connectors" : "Binnenkort"}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs">
            Kwaliteitsset: {evalHarness.summary.caseCount} cases gedocumenteerd (Leadgen vs Salesbrain).
          </p>
        </div>
      ) : null}
    </div>
  );
}

function toFlowNodes(graphNodes: SbGraphNode[], selectedId: string | null): Node[] {
  return graphToFlowNodes(graphNodes, selectedId);
}
