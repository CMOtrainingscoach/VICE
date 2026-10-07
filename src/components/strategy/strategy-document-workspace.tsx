"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  saveStrategyDocumentAction,
  type StrategyDocument,
} from "@/modules/strategy/actions";

const ALLOWED = /\.(md|markdown|txt)$/i;

export function StrategyDocumentWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: StrategyDocument | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [markdown, setMarkdown] = useState(initial?.markdown ?? "");
  const [fileName, setFileName] = useState(initial?.sourceFileName ?? "");
  const [savedAt, setSavedAt] = useState(initial?.savedAt ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!ALLOWED.test(file.name)) {
      setError("Kies een .md-, .markdown- of .txt-bestand.");
      return;
    }
    if (file.size > 500_000) {
      setError("Dit bestand is te groot. Gebruik maximaal 500 KB.");
      return;
    }
    const text = await file.text();
    if (text.trim().length < 40) {
      setError("Het bestand is te kort om te gebruiken.");
      return;
    }
    setMarkdown(text);
    setFileName(file.name);
  }

  async function save() {
    setBusy(true);
    setError("");
    const result = await saveStrategyDocumentAction(tenantId, markdown, fileName || null);
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Het bestand is niet opgeslagen." : result.error);
      return;
    }
    setMarkdown(result.data.markdown);
    setSavedAt(result.data.savedAt);
    setFileName(result.data.sourceFileName ?? fileName);
    router.refresh();
  }

  const savedLabel = savedAt
    ? `Bewaard ${new Date(savedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}${fileName ? ` · ${fileName}` : ""}`
    : "Nog geen bestand opgeslagen";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">Klanten / {tenantName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-vice-text md:text-3xl">Strategische audit</h1>
      <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
        Upload het markdownbestand van deze klant. Dat bestand is de context voor latere functies op het platform. Er wordt niets buiten VICE opgezocht.
      </p>

      <p className="mt-4 text-xs text-vice-text-muted" suppressHydrationWarning>
        {savedLabel}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="sr-only"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          Bestand kiezen
        </Button>
        <Button type="button" disabled={busy || markdown.trim().length < 40} onClick={() => void save()}>
          Bestand opslaan
        </Button>
        {fileName ? <span className="text-sm text-vice-text-muted">{fileName}</span> : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <textarea
        className="mt-6 min-h-[28rem] w-full rounded-md border border-vice-border bg-vice-surface px-3 py-3 font-mono text-sm text-vice-text"
        value={markdown}
        onChange={(event) => setMarkdown(event.target.value)}
        aria-label="Markdown van de strategische audit"
        placeholder="# Strategische audit — …"
      />
    </div>
  );
}
