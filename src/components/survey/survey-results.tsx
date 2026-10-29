"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSurveyAnswerDisplay, responseContactLabel } from "@/lib/survey/survey-answer-format";
import {
  isQuestionNode,
  nodeTypeLabel,
  type Survey,
  type SurveyNode,
  type SurveyResponseRow,
} from "@/lib/survey/survey-types";

export function SurveyResults({
  tenantId,
  tenantName,
  survey,
  responses,
}: {
  tenantId: string;
  tenantName: string;
  survey: Survey;
  responses: SurveyResponseRow[];
}) {
  const questionNodes = survey.definition.nodes.filter((n) => isQuestionNode(n.type));
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponseRow | null>(null);

  function exportCsv() {
    const headers = [
      "submittedAt",
      "contactName",
      "contactEmail",
      ...questionNodes.map((n) => n.data.questionLabel || n.data.screenTitle || n.id),
    ];
    const rows = responses.map((r) => {
      const contact = r.contact ?? {};
      return [
        r.submittedAt,
        contact.name ?? "",
        contact.email ?? "",
        ...questionNodes.map((n) => formatSurveyAnswerDisplay(r.answers[n.id], n)),
      ];
    });
    const csv = [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${survey.title.replace(/\s+/g, "-").slice(0, 40)}-resultaten.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        <Link href={`/klanten/${tenantId}/enquetes`} className="hover:text-vice-text">
          {tenantName} / Enquêtes
        </Link>
        {" / "}
        <Link href={`/klanten/${tenantId}/enquetes/${survey.id}`} className="hover:text-vice-text">
          {survey.title}
        </Link>
        {" / Resultaten"}
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-vice-text">Resultaten</h1>
          <p className="mt-2 text-sm text-vice-text-muted">{responses.length} antwoorden (max. 500 geladen)</p>
        </div>
        <Button type="button" variant="secondary" disabled={responses.length === 0} onClick={exportCsv}>
          <Download className="size-4" />
          CSV export
        </Button>
      </div>

      <div className="mt-8 space-y-6">
        {questionNodes.map((node) => (
          <section key={node.id} className="rounded-xl border border-vice-border bg-vice-surface p-5">
            <p className="text-xs uppercase text-vice-text-muted">{nodeTypeLabel(node.type)}</p>
            <h2 className="mt-1 font-medium">{node.data.questionLabel || node.data.screenTitle}</h2>
            <QuestionSummary nodeId={node.id} nodeType={node.type} options={node.data.options} responses={responses} />
          </section>
        ))}
        {questionNodes.length === 0 ? (
          <p className="text-sm text-vice-text-muted">Geen vraagschermen in deze enquête.</p>
        ) : null}
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-vice-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-vice-border bg-vice-surface text-xs uppercase text-vice-text-muted">
            <tr>
              <th className="px-4 py-3">Ingediend</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Inzending</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((r) => {
              const contactLabel = responseContactLabel(r.contact);
              const submittedLabel = new Date(r.submittedAt).toLocaleString("nl-NL");
              return (
                <tr key={r.id} className="border-b border-vice-border align-top last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-vice-text-muted">{submittedLabel}</td>
                  <td className="px-4 py-3">
                    {contactLabel ? (
                      <button
                        type="button"
                        className="text-left font-medium text-vice-gold hover:underline"
                        onClick={() => setSelectedResponse(r)}
                      >
                        {contactLabel}
                      </button>
                    ) : (
                      <span className="text-vice-text-muted">—</span>
                    )}
                    {r.contact?.name && r.contact.email ? (
                      <p className="mt-0.5 text-xs text-vice-text-muted">{r.contact.email}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-sm text-vice-gold hover:underline"
                      onClick={() => setSelectedResponse(r)}
                    >
                      Bekijk antwoorden
                    </button>
                  </td>
                </tr>
              );
            })}
            {responses.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-vice-text-muted">
                  Nog geen antwoorden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedResponse ? (
        <SurveyResponseDetailModal
          response={selectedResponse}
          questionNodes={questionNodes}
          onClose={() => setSelectedResponse(null)}
        />
      ) : null}
    </div>
  );
}

function SurveyResponseDetailModal({
  response,
  questionNodes,
  onClose,
}: {
  response: SurveyResponseRow;
  questionNodes: SurveyNode[];
  onClose: () => void;
}) {
  const title = responseContactLabel(response.contact) || "Inzending";
  const submitted = new Date(response.submittedAt).toLocaleString("nl-NL");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-vice-border bg-vice-surface p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="survey-response-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="survey-response-detail-title" className="font-display text-xl text-vice-text">
              {title}
            </h2>
            <p className="mt-1 text-sm text-vice-text-muted">Ingediend op {submitted}</p>
            {response.contact?.email && response.contact.name ? (
              <p className="text-sm text-vice-text-muted">{response.contact.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-text"
            aria-label="Sluiten"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <ul className="mt-6 space-y-4">
          {questionNodes.map((node) => {
            const answer = formatSurveyAnswerDisplay(response.answers[node.id], node);
            const hasAnswer = answer !== "—";
            return (
              <li key={node.id} className="rounded-lg border border-vice-border bg-vice-bg px-4 py-3">
                <p className="text-xs uppercase text-vice-text-muted">{nodeTypeLabel(node.type)}</p>
                <p className="mt-1 font-medium text-vice-text">
                  {node.data.questionLabel || node.data.screenTitle || "Vraag"}
                </p>
                <p className={`mt-2 text-sm ${hasAnswer ? "text-vice-text" : "text-vice-text-muted"}`}>{answer}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionSummary({
  nodeId,
  nodeType,
  options,
  responses,
}: {
  nodeId: string;
  nodeType: string;
  options?: { id: string; label: string }[];
  responses: SurveyResponseRow[];
}) {
  if (nodeType === "rating") {
    const nums = responses
      .map((r) => Number(r.answers[nodeId]))
      .filter((n) => !Number.isNaN(n));
    const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "—";
    return <p className="mt-2 text-sm text-vice-text-muted">Gemiddelde: {avg} ({nums.length} antwoorden)</p>;
  }

  if (options?.length && (nodeType === "radio" || nodeType === "dropdown" || nodeType === "multiple_choice")) {
    const counts = new Map<string, number>();
    for (const opt of options) counts.set(opt.id, 0);
    for (const r of responses) {
      const val = r.answers[nodeId];
      if (Array.isArray(val)) {
        for (const id of val) counts.set(id, (counts.get(String(id)) ?? 0) + 1);
      } else if (typeof val === "string") {
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }
    }
    return (
      <ul className="mt-3 space-y-1 text-sm">
        {options.map((opt) => (
          <li key={opt.id} className="flex justify-between gap-4">
            <span>{opt.label}</span>
            <span className="text-vice-text-muted">{counts.get(opt.id) ?? 0}</span>
          </li>
        ))}
      </ul>
    );
  }

  const samples = responses
    .map((r) => r.answers[nodeId])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .slice(0, 5);
  return (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-vice-text-muted">
      {samples.map((s, i) => (
        <li key={i}>{typeof s === "object" ? JSON.stringify(s) : String(s)}</li>
      ))}
      {samples.length === 0 ? <li>Geen antwoorden</li> : null}
    </ul>
  );
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
