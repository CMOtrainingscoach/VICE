"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_DISPLAY } from "@/lib/salesbrain/nodes/display-meta";
import type { SbNodeType } from "@/lib/salesbrain/types";
import { cn } from "@/lib/utils";

export type SbFlowNodeData = {
  label: string;
  subtitle?: string;
  nodeType: SbNodeType;
  selected?: boolean;
  compact?: boolean;
};

export function SbFlowNode({ data, selected }: NodeProps) {
  const d = data as SbFlowNodeData;
  const meta = NODE_DISPLAY[d.nodeType];
  const title = d.label || meta.title;
  const subtitle = d.subtitle ?? meta.subtitle;

  return (
    <div
      className={cn(
        "min-w-[168px] max-w-[220px] rounded-xl border bg-vice-surface px-4 py-3 shadow-sm transition-shadow",
        selected ? "border-vice-gold ring-2 ring-vice-gold/30" : "border-vice-border",
        d.compact && "opacity-85 scale-[0.92]",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-vice-border !bg-vice-bg" />
      <p className="text-sm font-semibold leading-tight text-vice-text">{title}</p>
      <p className="mt-1 text-xs text-vice-text-muted">{subtitle}</p>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-vice-border !bg-vice-gold" />
    </div>
  );
}

export const sbFlowNodeTypes = { sb: SbFlowNode };
