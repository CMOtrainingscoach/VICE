"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { SurveyBrandedShell, surveyHeadingStyle } from "@/components/survey/survey-branded-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findWelcomeNode, resolveNextNodeId } from "@/lib/survey/survey-graph";
import {
  isQuestionNode,
  type PublishedSurvey,
  type SurveyNode,
} from "@/lib/survey/survey-types";
import { submitSurveyResponseAction } from "@/modules/survey/survey-actions";

const fieldClass =
  "w-full rounded-md border border-[color:var(--survey-primary)]/30 bg-white/80 px-3 py-2 text-sm outline-none focus:border-[color:var(--survey-primary)] dark:bg-vice-surface";

export function SurveyPublicRunner({
  slug,
  survey,
  embed,
}: {
  slug: string;
  survey: PublishedSurvey;
  embed?: boolean;
}) {
  const welcome = useMemo(() => findWelcomeNode(survey.definition), [survey.definition]);
  const brand = survey.definition.settings?.brandSnapshot;

  const [started, setStarted] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(welcome?.id ?? null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<unknown>("");
  const [draftMulti, setDraftMulti] = useState<string[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nodeMap = useMemo(() => new Map(survey.definition.nodes.map((n) => [n.id, n])), [survey.definition.nodes]);
  const current = currentId ? nodeMap.get(currentId) : null;

  function resetDraftFor(node: SurveyNode) {
    const prev = answers[node.id];
    if (node.type === "multiple_choice" && Array.isArray(prev)) {
      setDraftMulti(prev as string[]);
      setDraft("");
    } else {
      setDraftMulti([]);
      setDraft(typeof prev === "string" || typeof prev === "number" ? String(prev) : "");
    }
    if (node.type === "contact" && prev && typeof prev === "object") {
      const c = prev as { name?: string; email?: string };
      setContactName(c.name ?? "");
      setContactEmail(c.email ?? "");
    }
  }

  function begin() {
    if (!welcome) return;
    setStarted(true);
    const next = resolveNextNodeId(survey.definition, welcome.id, null);
    if (next) {
      setCurrentId(next);
      const n = nodeMap.get(next);
      if (n) resetDraftFor(n);
    }
  }

  async function goNext() {
    if (!current || current.type === "thank_you") return;
    setError("");

    let value: unknown = draft;
    if (current.type === "multiple_choice") value = draftMulti;
    if (current.type === "rating") value = Number(draft);
    if (current.type === "contact") {
      value = { name: contactName.trim(), email: contactEmail.trim() };
    }

    if (current.data.required && isQuestionNode(current.type)) {
      if (current.type === "multiple_choice" && draftMulti.length === 0) {
        setError("Dit veld is verplicht.");
        return;
      }
      if (current.type === "contact") {
        if (!contactName.trim() && !contactEmail.trim()) {
          setError("Vul minstens naam of e-mail in.");
          return;
        }
      } else if (current.type === "rating" && Number.isNaN(value)) {
        setError("Dit veld is verplicht.");
        return;
      } else if (current.type !== "multiple_choice" && String(value ?? "").trim() === "") {
        setError("Dit veld is verplicht.");
        return;
      }
    }

    const updatedAnswers = isQuestionNode(current.type)
      ? { ...answers, [current.id]: value }
      : answers;

    const branchValue =
      current.type === "multiple_choice" ? draftMulti[0] : current.type === "rating" ? String(value) : value;

    const nextId = resolveNextNodeId(survey.definition, current.id, branchValue);
    if (!nextId) {
      setError("Geen vervolgstap in deze enquête.");
      return;
    }

    const nextNode = nodeMap.get(nextId);

    if (nextNode?.type === "thank_you") {
      setBusy(true);
      const result = await submitSurveyResponseAction({
        slug,
        answers: updatedAnswers,
        contact:
          survey.definition.settings?.askContact || contactName || contactEmail
            ? { name: contactName.trim() || undefined, email: contactEmail.trim() || undefined }
            : null,
        userAgent: navigator.userAgent,
        referrer: document.referrer,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      setAnswers(updatedAnswers);
      setCurrentId(nextId);
      return;
    }

    setAnswers(updatedAnswers);
    setCurrentId(nextId);
    if (nextNode) resetDraftFor(nextNode);
  }

  if (!welcome) {
    return (
      <SurveyBrandedShell brand={brand} embed={embed}>
        <p className="text-sm">Deze enquête is onvolledig (geen welkomstscherm).</p>
      </SurveyBrandedShell>
    );
  }

  if (!started) {
    return (
      <SurveyBrandedShell brand={brand} embed={embed}>
        <h1 className="text-2xl font-semibold" style={surveyHeadingStyle(brand?.typography)}>
          {welcome.data.screenTitle}
        </h1>
        {welcome.data.screenDescription ? (
          <p className="mt-3 text-sm opacity-90">{welcome.data.screenDescription}</p>
        ) : null}
        {survey.definition.settings?.privacyText ? (
          <p className="mt-4 text-xs opacity-70">{survey.definition.settings.privacyText}</p>
        ) : null}
        <Button type="button" className="mt-8" onClick={begin}>
          {welcome.data.buttonLabel || "Start"}
        </Button>
      </SurveyBrandedShell>
    );
  }

  if (!current) {
    return (
      <SurveyBrandedShell brand={brand} embed={embed}>
        <p className="text-sm">Enquête beëindigd.</p>
      </SurveyBrandedShell>
    );
  }

  if (current.type === "thank_you") {
    return (
      <SurveyBrandedShell brand={brand} embed={embed}>
        <h1 className="text-2xl font-semibold" style={surveyHeadingStyle(brand?.typography)}>
          {current.data.screenTitle}
        </h1>
        <p className="mt-3 text-sm opacity-90">{current.data.screenDescription}</p>
        {submitted ? (
          <p className="mt-4 text-xs text-vice-text-muted">Je antwoorden zijn opgeslagen.</p>
        ) : null}
      </SurveyBrandedShell>
    );
  }

  return (
    <SurveyBrandedShell brand={brand} embed={embed}>
      <p className="text-xs uppercase tracking-wide opacity-60">{current.data.screenTitle}</p>
      {current.data.screenDescription ? (
        <p className="mt-2 text-sm opacity-80">{current.data.screenDescription}</p>
      ) : null}

      <div className="mt-6">
        {isQuestionNode(current.type) && current.type !== "contact" ? (
          <p className="mb-2 font-medium" style={surveyHeadingStyle(brand?.typography)}>
            {current.data.questionLabel}
            {current.data.required ? " *" : ""}
          </p>
        ) : null}

        {current.type === "title_screen" ? (
          <h2 className="text-xl font-semibold" style={surveyHeadingStyle(brand?.typography)}>
            {current.data.screenTitle}
          </h2>
        ) : null}

        {current.type === "short_text" ? (
          <Input className={fieldClass} value={String(draft)} onChange={(e) => setDraft(e.target.value)} />
        ) : null}

        {current.type === "long_text" ? (
          <textarea className={`${fieldClass} min-h-28`} value={String(draft)} onChange={(e) => setDraft(e.target.value)} />
        ) : null}

        {(current.type === "radio" || current.type === "dropdown") && current.data.options ? (
          current.type === "dropdown" ? (
            <select className={fieldClass} value={String(draft)} onChange={(e) => setDraft(e.target.value)}>
              <option value="">Kies…</option>
              {current.data.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              {current.data.options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={current.id}
                    checked={draft === o.id}
                    onChange={() => setDraft(o.id)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )
        ) : null}

        {current.type === "multiple_choice" && current.data.options ? (
          <div className="space-y-2">
            {current.data.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draftMulti.includes(o.id)}
                  onChange={(e) => {
                    setDraftMulti((prev) =>
                      e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id),
                    );
                  }}
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : null}

        {current.type === "rating" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {Array.from(
                { length: (current.data.scaleMax ?? 5) - (current.data.scaleMin ?? 1) + 1 },
                (_, i) => (current.data.scaleMin ?? 1) + i,
              ).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={
                    Number(draft) === n
                      ? "size-10 rounded-full border-2 border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)]/15 font-medium"
                      : "size-10 rounded-full border border-[color:var(--survey-primary)]/40"
                  }
                  onClick={() => setDraft(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs opacity-70">
              <span>{current.data.scaleMinLabel}</span>
              <span>{current.data.scaleMaxLabel}</span>
            </div>
          </div>
        ) : null}

        {current.type === "contact" ? (
          <div className="space-y-3">
            <Input placeholder="Naam" className={fieldClass} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            <Input
              placeholder="E-mail"
              type="email"
              className={fieldClass}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <Button type="button" className="mt-8" disabled={busy} onClick={() => void goNext()}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Volgende
      </Button>
    </SurveyBrandedShell>
  );
}
