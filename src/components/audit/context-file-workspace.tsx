"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuditStepNav } from "@/components/audit/audit-step-nav";
import { fieldClass, goldButtonClass } from "@/components/stp/stp-ui";
import { Button } from "@/components/ui/button";
import { CONTEXT_FRAMEWORK_INDEX, CONTEXT_LABEL } from "@/lib/value-chain/constants";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { saveContextFileAction, type ContextFileDraft } from "@/modules/audit/context-actions";

export function ContextFileWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: ContextFileDraft;
}) {
  const router = useRouter();
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [savedAt, setSavedAt] = useState(initial.savedAt);
  const [status, setStatus] = useState(initial.status);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    const result = await saveContextFileAction(tenantId, markdown);
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Het bestand is niet opgeslagen." : result.error);
      return;
    }
    setMarkdown(result.data.markdown);
    setSavedAt(result.data.savedAt);
    setStatus(result.data.status);
    router.refresh();
  }

  const savedLabel = savedAt
    ? `${status === "final" ? "Afgerond" : "Concept"} · bewaard ${new Date(savedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}`
    : "Nog niet opgeslagen";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">
        Stap {CONTEXT_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · {CONTEXT_LABEL} · {tenantName}
      </p>
      <AuditStepNav />
      <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">Het contextbestand</h1>
      <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
        Dit markdownbestand is de context voor latere functies, zoals Brand. Er wordt niets buiten VICE opgezocht.
      </p>
      <p className="mt-4 text-xs text-vice-text-muted" suppressHydrationWarning>{savedLabel}</p>
      <textarea
        className={`${fieldClass} mt-4 min-h-[28rem] font-mono`}
        value={markdown}
        onChange={(event) => setMarkdown(event.target.value)}
        aria-label="Markdown van de strategische audit"
        placeholder="# Strategische audit — …"
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" className={goldButtonClass} disabled={busy || markdown.trim().length < 40} onClick={() => void save()}>
          Sla bestand op
        </Button>
        {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
