"use client";

import { useState } from "react";
import { ImageIcon, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { beeldCompositionToJpegFile } from "@/lib/content/beeld-import";
import type { BeeldCompositionSummary } from "@/lib/content/beeld-types";
import type { ClientBrand } from "@/lib/brand/types";
import { loadBeeldCompositionAction } from "@/modules/content/beeld-actions";
import { uploadBlogVisualAction } from "@/modules/content/blog-actions";
import { uploadSocialAssetAction } from "@/modules/content/social-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function ContentBeeldImportField({
  tenantId,
  conceptId,
  compositions,
  clientBrand,
  target,
  disabled,
  onSocialImported,
  onBlogImported,
}: {
  tenantId: string;
  conceptId: string | null;
  compositions: BeeldCompositionSummary[];
  clientBrand: ClientBrand | null;
  target: "social" | "blog";
  disabled?: boolean;
  onSocialImported?: (concept: import("@/lib/content/social-types").SocialPostConcept) => void;
  onBlogImported?: (concept: import("@/lib/content/blog-types").BlogConcept) => void;
}) {
  const [compositionId, setCompositionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (compositions.length === 0) {
    return (
      <p className="text-xs text-vice-text-muted">
        Geen beeldmateriaal.{" "}
        <Link className="text-vice-gold underline" href={`/klanten/${tenantId}/content/beeld`}>
          Maak composities in Beeldmateriaal
        </Link>
        .
      </p>
    );
  }

  async function importSelected() {
    if (!conceptId || !compositionId) return;
    setBusy(true);
    setError("");
    try {
      const loaded = await loadBeeldCompositionAction(compositionId);
      if (!loaded.ok || !loaded.data) {
        throw new Error(loaded.ok ? "Compositie laden mislukt" : loaded.error);
      }
      if (loaded.data.tenantId !== tenantId) {
        throw new Error("Compositie hoort niet bij deze klant.");
      }
      const file = await beeldCompositionToJpegFile(loaded.data, clientBrand);
      const form = new FormData();
      form.set("file", file);
      if (target === "social") {
        const result = await uploadSocialAssetAction(conceptId, form);
        if (!result.ok || !result.data) {
          throw new Error(result.ok ? "Importeren mislukt" : result.error);
        }
        onSocialImported?.(result.data);
      } else {
        const result = await uploadBlogVisualAction(conceptId, form);
        if (!result.ok || !result.data) {
          throw new Error(result.ok ? "Importeren mislukt" : result.error);
        }
        onBlogImported?.(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Importeren mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-vice-border bg-vice-bg/40 p-3">
      <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-vice-text-muted">
        <ImageIcon className="size-3.5" aria-hidden />
        Beeldmateriaal
      </Label>
      <div className="flex flex-wrap items-end gap-2">
        <select
          className={`${fieldClass} min-w-[12rem] flex-1`}
          value={compositionId}
          disabled={disabled || busy || !conceptId}
          onChange={(e) => setCompositionId(e.target.value)}
        >
          <option value="">Kies compositie…</option>
          {compositions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title || "Naamloos"}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy || !conceptId || !compositionId}
          onClick={() => void importSelected()}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Importeren
        </Button>
      </div>
      {!conceptId ? (
        <p className="mt-2 text-xs text-vice-text-muted">Sla het concept eerst op om beeldmateriaal te importeren.</p>
      ) : (
        <p className="mt-2 text-xs text-vice-text-muted">
          Exporteert de compositie (lagen + tekst + logo + AI-label) als JPEG naar dit {target === "social" ? "social" : "blog"}
          -concept.
        </p>
      )}
      {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
