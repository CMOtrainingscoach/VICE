"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
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
import { exampleFirstMarketerFormSchema, exampleFirstMarketerWorkflow } from "@/lib/salesbrain/graph/example-first-marketer";
import { canConnectNodeTypes } from "@/lib/salesbrain/graph/port-compat";
import type { SbWorkflowDefinition } from "@/lib/salesbrain/graph/types";
import { validateWorkflowGraph } from "@/lib/salesbrain/graph/validate";
import { buildEvalHarness } from "@/lib/salesbrain/eval-harness";
import { NODE_REGISTRY } from "@/lib/salesbrain/nodes/registry";
import {
  publishWorkflowGraphAction,
  saveWorkflowDraftAction,
} from "@/modules/salesbrain/actions";

function toFlowNodes(def: SbWorkflowDefinition): Node[] {
  return def.nodes.map((n, i) => ({
    id: n.id,
    type: "default",
    position: n.position ?? { x: (i % 3) * 220, y: Math.floor(i / 3) * 120 },
    data: { label: `${n.label} (${n.type})`, nodeType: n.type },
  }));
}

function toFlowEdges(def: SbWorkflowDefinition): Edge[] {
  return def.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
}

function definitionFromState(base: SbWorkflowDefinition, nodes: Node[], edges: Edge[]): SbWorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: base.nodes.map((n) => {
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
  workflowId,
  initialDefinition,
}: {
  tenantId: string;
  workflowId: string;
  initialDefinition?: SbWorkflowDefinition;
}) {
  const base = useMemo(() => initialDefinition ?? exampleFirstMarketerWorkflow(), [initialDefinition]);
  const formSchema = useMemo(() => exampleFirstMarketerFormSchema(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(base));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(base));
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"workflow" | "client" | "runs">("workflow");
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeTypeById = useMemo(() => new Map(base.nodes.map((n) => [n.id, n.type])), [base.nodes]);

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
        const next = addEdge(connection, eds);
        pushHistory(nodes, next);
        scheduleAutosave(definitionFromState(base, nodes, next));
        return next;
      });
    },
    [base, isValidConnection, nodes, pushHistory, scheduleAutosave, setEdges],
  );

  useEffect(() => {
    pushHistory(toFlowNodes(base), toFlowEdges(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed undo stack once
  }, []);

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
    const def = definitionFromState(base, nodes, edges);
    const issues = validateWorkflowGraph(def);
    if (issues.some((i) => i.code !== "deferred_node")) {
      setMessage(issues[0]?.message ?? "Validatiefout");
      return;
    }
    const result = await publishWorkflowGraphAction(tenantId, workflowId, def, formSchema);
    setMessage(result.ok ? "Gepubliceerd." : result.error);
  }

  async function onTestNode() {
    setMessage("Node-test: gebruik «Test als klant» op de home voor een end-to-end run.");
  }

  const validationIssues = validateWorkflowGraph(definitionFromState(base, nodes, edges));
  const evalHarness = useMemo(() => buildEvalHarness(), []);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="flex flex-wrap gap-2 border-b border-vice-border px-4 py-2 text-sm">
        {(["workflow", "client", "runs"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`px-3 py-1 capitalize ${tab === t ? "border-b-2 border-vice-gold" : "text-vice-text-muted"}`}
            onClick={() => setTab(t)}
          >
            {t === "workflow" ? "Workflow" : t === "client" ? "Klantervaring" : "Uitvoeringen"}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={undo}>
            Ongedaan
          </Button>
          <Button type="button" variant="ghost" onClick={redo}>
            Opnieuw
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onTestNode()}>
            Node test
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onPublish()}>
            Publiceren
          </Button>
        </div>
      </div>
      {message ? <p className="px-4 py-2 text-sm text-vice-text-muted">{message}</p> : null}
      {validationIssues.length ? (
        <p className="px-4 py-1 text-xs text-amber-700" role="status">
          {validationIssues[0]?.message}
        </p>
      ) : null}
      {tab === "workflow" ? (
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
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
