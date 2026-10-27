"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NODE_DISPLAY } from "@/lib/salesbrain/nodes/display-meta";
import type { SbGraphNode } from "@/lib/salesbrain/graph/types";

type Props = {
  node: SbGraphNode | null;
  onChange: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function SbNodeInspector({ node, onChange }: Props) {
  if (!node) {
    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-vice-border bg-vice-surface p-5 text-sm">
        <p className="text-vice-text-muted">Selecteer een node om instellingen te bewerken.</p>
      </aside>
    );
  }

  const meta = NODE_DISPLAY[node.type];
  const cfg = node.config;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-vice-border bg-vice-surface p-5 text-sm">
      <h2 className="font-semibold text-vice-text">{node.label || meta.title}</h2>
      <p className="mt-1 text-xs text-vice-text-muted">{meta.subtitle}</p>

      {node.type === "job_ads" ? (
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="sb-insp-query">Zoekopdracht</Label>
            <textarea
              id="sb-insp-query"
              className="mt-1.5 min-h-[72px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={String(cfg.searchQuery ?? "Zoek bedrijven die een eerste marketeer aanwerven")}
              onChange={(e) => onChange(node.id, { searchQuery: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="sb-insp-region">Regio</Label>
            <Input id="sb-insp-region" className="mt-1.5 font-mono text-xs" readOnly value="{{ Uit klantinput }}" />
          </div>
          <div>
            <Label htmlFor="sb-insp-period">Periode</Label>
            <select
              id="sb-insp-period"
              className="mt-1.5 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={String(cfg.period ?? "30d")}
              onChange={(e) => onChange(node.id, { period: e.target.value })}
            >
              <option value="30d">Laatste 30 dagen</option>
              <option value="7d">Laatste 7 dagen</option>
              <option value="90d">Laatste 90 dagen</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(cfg.verifyOriginalAd ?? true)}
              onChange={(e) => onChange(node.id, { verifyOriginalAd: e.target.checked })}
            />
            Controleer originele vacature
          </label>
          <div>
            <Label htmlFor="sb-insp-error">Bij fout</Label>
            <select
              id="sb-insp-error"
              className="mt-1.5 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={String(cfg.onError ?? "stop_branch")}
              onChange={(e) => onChange(node.id, { onError: e.target.value })}
            >
              <option value="stop_branch">Stop deze tak</option>
              <option value="continue">Doorgaan met waarschuwing</option>
            </select>
          </div>
        </div>
      ) : null}

      {node.type === "web_research" ? (
        <div className="mt-6 space-y-4">
          <div>
            <Label>Max. resultaten</Label>
            <Input
              type="number"
              className="mt-1.5"
              value={Number(cfg.maxResults ?? 20)}
              onChange={(e) => onChange(node.id, { maxResults: Number(e.target.value) })}
            />
          </div>
        </div>
      ) : null}

      {node.type === "start" ? (
        <p className="mt-6 text-xs text-vice-text-muted">
          Velden komen uit de klantervaring-tab (doel, locatie, straal). Regio:{" "}
          <code className="rounded bg-vice-bg px-1">{`{{ klantinput }}`}</code>
        </p>
      ) : null}

      {!["job_ads", "web_research", "start"].includes(node.type) ? (
        <p className="mt-6 text-xs text-vice-text-muted">
          Node-type <span className="font-mono">{node.type}</span> — uitvoering volgt de gepubliceerde workflow-config.
        </p>
      ) : null}
    </aside>
  );
}
