"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { isBranchingQuestion, nodeTypeLabel, type SurveyNodeType } from "@/lib/survey/survey-types";

export type SurveyFlowNodeData = {
  surveyType: SurveyNodeType;
  title: string;
  subtitle: string;
};

export function SurveyFlowNode({ data, selected }: NodeProps) {
  const d = data as SurveyFlowNodeData;
  const branching = isBranchingQuestion(d.surveyType);
  const options = branching ? (data as SurveyFlowNodeData & { options?: { id: string; label: string }[] }).options : undefined;

  return (
    <div
      className={
        selected
          ? "min-w-[180px] max-w-[240px] rounded-xl border-2 border-vice-gold bg-vice-surface px-3 py-2 shadow-md"
          : "min-w-[180px] max-w-[240px] rounded-xl border border-vice-border bg-vice-surface px-3 py-2 shadow-sm"
      }
    >
      {d.surveyType !== "welcome" ? (
        <Handle type="target" position={Position.Top} className="!bg-vice-gold" />
      ) : null}

      <p className="text-[10px] font-medium uppercase tracking-wide text-vice-gold">
        {nodeTypeLabel(d.surveyType)}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-vice-text">{d.title || "Naamloos"}</p>
      {d.subtitle ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-vice-text-muted">{d.subtitle}</p>
      ) : null}

      {d.surveyType === "thank_you" ? null : branching && options?.length ? (
        <div className="relative mt-3 border-t border-vice-border pt-2">
          <ul className="space-y-0.5">
            {options.map((opt, i) => (
              <li key={opt.id} className="truncate text-[10px] text-vice-text-muted">
                {opt.label || `Optie ${i + 1}`}
              </li>
            ))}
          </ul>
          {options.map((opt, i) => {
            const left = `${((i + 1) / (options.length + 1)) * 100}%`;
            return (
              <Handle
                key={opt.id}
                type="source"
                position={Position.Bottom}
                id={opt.id}
                className="!bg-vice-gold"
                style={{ left }}
              />
            );
          })}
          <Handle type="source" position={Position.Bottom} id="default" className="!bg-vice-text-muted" style={{ left: "95%" }} />
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!bg-vice-gold" />
      )}
    </div>
  );
}
