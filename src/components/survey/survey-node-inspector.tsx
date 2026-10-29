"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultNodeData,
  isBranchingQuestion,
  isQuestionNode,
  newSurveyOption,
  nodeTypeLabel,
  type SurveyNode,
  type SurveyNodeType,
} from "@/lib/survey/survey-types";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function SurveyNodeInspector({
  node,
  onChange,
}: {
  node: SurveyNode | null;
  onChange: (next: SurveyNode) => void;
}) {
  if (!node) {
    return (
      <p className="text-sm text-vice-text-muted">Selecteer een scherm in de flow om te bewerken.</p>
    );
  }

  function patchData(partial: Partial<SurveyNode["data"]>) {
    if (!node) return;
    onChange({ ...node, data: { ...node.data, ...partial } });
  }

  const type = node.type as SurveyNodeType;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase text-vice-text-muted">{nodeTypeLabel(type)}</p>
        <p className="mt-1 text-xs text-vice-text-muted">ID: {node.id.slice(0, 8)}…</p>
      </div>

      <div>
        <Label className="text-xs text-vice-text-muted">Titel</Label>
        <Input
          className="mt-1"
          value={node.data.screenTitle}
          onChange={(e) => patchData({ screenTitle: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs text-vice-text-muted">Beschrijving</Label>
        <textarea
          className={`${fieldClass} mt-1 min-h-20`}
          value={node.data.screenDescription}
          onChange={(e) => patchData({ screenDescription: e.target.value })}
        />
      </div>

      {type === "welcome" ? (
        <div>
          <Label className="text-xs text-vice-text-muted">Knoptekst</Label>
          <Input
            className="mt-1"
            value={node.data.buttonLabel ?? "Start"}
            onChange={(e) => patchData({ buttonLabel: e.target.value })}
          />
        </div>
      ) : null}

      {isQuestionNode(type) ? (
        <>
          <div>
            <Label className="text-xs text-vice-text-muted">Vraag</Label>
            <Input
              className="mt-1"
              value={node.data.questionLabel ?? ""}
              onChange={(e) => patchData({ questionLabel: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={node.data.required === true}
              onChange={(e) => patchData({ required: e.target.checked })}
            />
            Verplicht
          </label>
        </>
      ) : null}

      {isBranchingQuestion(type) ? (
        <div>
          <Label className="text-xs text-vice-text-muted">Antwoordopties</Label>
          <p className="mt-1 text-xs text-vice-text-muted">
            Verbind elke optie-handles in de flow voor vertakking.
          </p>
          <ul className="mt-2 space-y-2">
            {(node.data.options ?? []).map((opt, index) => (
              <li key={opt.id} className="flex gap-2">
                <Input
                  value={opt.label}
                  onChange={(e) => {
                    const options = [...(node.data.options ?? [])];
                    options[index] = { ...opt, label: e.target.value };
                    patchData({ options });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 px-2"
                  aria-label="Optie verwijderen"
                  onClick={() => {
                    const options = (node.data.options ?? []).filter((o) => o.id !== opt.id);
                    patchData({ options: options.length ? options : [newSurveyOption("Optie")] });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={() => patchData({ options: [...(node.data.options ?? []), newSurveyOption()] })}
          >
            <Plus className="size-4" />
            Optie
          </Button>
        </div>
      ) : null}

      {type === "rating" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-vice-text-muted">Min</Label>
            <Input
              type="number"
              className="mt-1"
              value={node.data.scaleMin ?? 1}
              onChange={(e) => patchData({ scaleMin: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs text-vice-text-muted">Max</Label>
            <Input
              type="number"
              className="mt-1"
              value={node.data.scaleMax ?? 5}
              onChange={(e) => patchData({ scaleMax: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-vice-text-muted">Label min</Label>
            <Input
              className="mt-1"
              value={node.data.scaleMinLabel ?? ""}
              onChange={(e) => patchData({ scaleMinLabel: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-vice-text-muted">Label max</Label>
            <Input
              className="mt-1"
              value={node.data.scaleMaxLabel ?? ""}
              onChange={(e) => patchData({ scaleMaxLabel: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        className="text-xs text-vice-text-muted"
        onClick={() => onChange({ ...node, data: defaultNodeData(type) })}
      >
        Standaardteksten herstellen
      </Button>
    </div>
  );
}
