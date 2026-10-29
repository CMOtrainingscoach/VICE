"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, LoaderCircle, Save } from "lucide-react";
import {
  SurveyFlowBuilder,
  getSurveyNode,
  patchSurveyNode,
} from "@/components/survey/survey-flow-builder";
import { SurveyNodeInspector } from "@/components/survey/survey-node-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateSurveyDefinition } from "@/lib/survey/survey-graph";
import type { Survey, SurveyNode } from "@/lib/survey/survey-types";
import {
  closeSurveyAction,
  publishSurveyAction,
  saveSurveyAction,
} from "@/modules/survey/survey-actions";

const SAVE_DEBOUNCE_MS = 2200;

export function SurveyBuilderWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: Survey;
}) {
  const [survey, setSurvey] = useState(initial);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ title: string; definition: Survey["definition"] } | null>(null);
  const surveyRef = useRef(survey);
  surveyRef.current = survey;

  const selectedNode = getSurveyNode(survey.definition, selectedNodeId);

  const flushSave = useCallback(async () => {
    const patch = pendingSave.current;
    if (!patch) return;
    pendingSave.current = null;
    setBusy("save");
    setError("");
    const current = surveyRef.current;
    const result = await saveSurveyAction(current.id, current.updatedAt, patch);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Opslaan mislukt" : result.error);
      return;
    }
    setSurvey(result.data);
  }, []);

  function scheduleSave(patch: { title?: string; definition?: Survey["definition"] }) {
    pendingSave.current = {
      title: patch.title ?? pendingSave.current?.title ?? survey.title,
      definition: patch.definition ?? pendingSave.current?.definition ?? survey.definition,
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function updateDefinition(def: Survey["definition"]) {
    setSurvey((s) => ({ ...s, definition: def }));
    scheduleSave({ definition: def });
  }

  function updateNode(node: SurveyNode) {
    const def = patchSurveyNode(survey.definition, node);
    updateDefinition(def);
  }

  async function runPublish() {
    setError("");
    const err = validateSurveyDefinition(survey.definition);
    if (err) {
      setError(err);
      return;
    }
    if (pendingSave.current) {
      await flushSave();
    }
    setBusy("publish");
    const result = await publishSurveyAction(survey.id);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Publiceren mislukt" : result.error);
      return;
    }
    setSurvey(result.data);
  }

  async function runClose() {
    setBusy("close");
    const result = await closeSurveyAction(survey.id);
    setBusy("");
    if (result.ok && result.data) setSurvey(result.data);
  }

  const publicUrl =
    typeof window !== "undefined" && survey.publicSlug
      ? `${window.location.origin}/e/${survey.publicSlug}`
      : survey.publicSlug
        ? `/e/${survey.publicSlug}`
        : "";

  const embedCode = publicUrl
    ? `<iframe src="${publicUrl}?embed=1" width="100%" height="640" style="border:0;border-radius:12px;" title="${survey.title.replace(/"/g, "&quot;")}"></iframe>`
    : "";

  async function copyText(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(msg);
      setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setError("Kopiëren mislukt");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        <Link href={`/klanten/${tenantId}/enquetes`} className="hover:text-vice-text">
          {tenantName} / Enquêtes
        </Link>
        {" / "}
        {survey.title}
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[12rem] flex-1">
          <Input
            value={survey.title}
            onChange={(e) => {
              const title = e.target.value;
              setSurvey((s) => ({ ...s, title }));
              scheduleSave({ title });
            }}
            className="text-lg font-medium"
          />
          <p className="mt-1 text-xs text-vice-text-muted">
            Status: {survey.status === "published" ? "Gepubliceerd" : survey.status === "closed" ? "Gesloten" : "Concept"}
            {survey.responseCount > 0 ? ` · ${survey.responseCount} antwoorden` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void flushSave()}>
            {busy === "save" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Opslaan
          </Button>
          <Link href={`/klanten/${tenantId}/enquetes/${survey.id}/resultaten`}>
            <Button type="button" variant="secondary">
              Resultaten
            </Button>
          </Link>
          {survey.status === "published" ? (
            <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => void runClose()}>
              Sluiten
            </Button>
          ) : null}
          <Button type="button" disabled={Boolean(busy)} onClick={() => void runPublish()}>
            {busy === "publish" ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Publiceren
          </Button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {copyMsg ? <p className="mt-3 text-sm text-vice-gold">{copyMsg}</p> : null}

      {survey.publicSlug ? (
        <div className="mt-4 rounded-xl border border-vice-border bg-vice-surface p-4">
          <p className="text-sm font-medium">Deelbare link</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <code className="flex-1 truncate rounded-md bg-vice-bg px-2 py-1 text-xs">{publicUrl}</code>
            <Button type="button" variant="secondary" onClick={() => void copyText(publicUrl, "Link gekopieerd")}>
              <Copy className="size-4" />
            </Button>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary">
                <ExternalLink className="size-4" />
              </Button>
            </a>
          </div>
          <p className="mt-3 text-sm font-medium">Embed</p>
          <textarea readOnly className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg p-2 text-xs" rows={3} value={embedCode} />
          <Button type="button" variant="secondary" className="mt-2" onClick={() => void copyText(embedCode, "Embed-code gekopieerd")}>
            <Copy className="size-4" />
            Kopieer iframe
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <SurveyFlowBuilder
          definition={survey.definition}
          selectedNodeId={selectedNodeId}
          onDefinitionChange={updateDefinition}
          onSelectNode={setSelectedNodeId}
        />
        <aside className="rounded-xl border border-vice-border bg-vice-surface p-4">
          <h2 className="text-sm font-medium">Scherm bewerken</h2>
          <div className="mt-4">
            <SurveyNodeInspector node={selectedNode} onChange={updateNode} />
          </div>
        </aside>
      </div>
    </div>
  );
}
