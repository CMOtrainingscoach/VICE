"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export type StrategyDocument = {
  id: string;
  markdown: string;
  status: "draft" | "final";
  savedAt: string | null;
  sourceFileName: string | null;
};

const MIGRATION =
  "Pas migratie 20260330134600 toe in de Supabase SQL-editor, na 20260330134500.";

const MISSING =
  /get_strategy_document|save_strategy_document|get_audit_context|schema cache|does not exist|Could not find the function/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? MIGRATION : message;
}

async function client() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function mapDocument(raw: unknown): StrategyDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: string;
    markdown?: string;
    status?: string;
    saved_at?: string | null;
    source_file_name?: string | null;
  };
  if (!row.markdown) return null;
  return {
    id: String(row.id ?? ""),
    markdown: row.markdown,
    status: row.status === "final" ? "final" : "draft",
    savedAt: row.saved_at ?? null,
    sourceFileName: row.source_file_name ?? null,
  };
}

/** Laadt het strategische markdownbestand van één klant. Voor latere features. */
export async function loadStrategyDocumentAction(
  tenantId: string,
): Promise<ActionResult<StrategyDocument | null>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("get_strategy_document", {
    p_tenant_id: tenantId,
  });
  if (error) {
    if (MISSING.test(error.message)) {
      const fallback = await supabase.schema("app").rpc("get_audit_context", { p_tenant_id: tenantId });
      if (!fallback.error) return { ok: true, data: mapDocument(fallback.data) };
      return { ok: false, error: MIGRATION };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: mapDocument(data) };
}

export async function saveStrategyDocumentAction(
  tenantId: string,
  markdown: string,
  fileName?: string | null,
): Promise<ActionResult<StrategyDocument>> {
  const text = markdown.trim();
  if (text.length < 40) return { ok: false, error: "Het bestand is te kort om op te slaan." };
  if (text.length > 500_000) return { ok: false, error: "Dit bestand is te groot. Gebruik maximaal 500.000 tekens." };

  const supabase = await client();
  const saved = await supabase.schema("app").rpc("save_strategy_document", {
    p_tenant_id: tenantId,
    p_markdown: text,
    p_file_name: fileName?.trim() || null,
  });

  if (saved.error) {
    if (MISSING.test(saved.error.message)) {
      const legacy = await supabase.schema("app").rpc("save_strategy_context", {
        p_tenant_id: tenantId,
        p_markdown: text,
      });
      if (!legacy.error) {
        revalidateStrategy(tenantId);
        const again = await loadStrategyDocumentAction(tenantId);
        if (again.ok && again.data) return { ok: true, data: again.data };
        return {
          ok: true,
          data: {
            id: "",
            markdown: text,
            status: "draft",
            savedAt: (legacy.data as { saved_at?: string } | null)?.saved_at ?? null,
            sourceFileName: fileName?.trim() || null,
          },
        };
      }
      return {
        ok: false,
        error: /save_strategy_context|schema cache|does not exist/i.test(legacy.error?.message ?? "")
          ? MIGRATION
          : migrationError(legacy.error?.message ?? saved.error.message),
      };
    }
    return { ok: false, error: migrationError(saved.error.message) };
  }

  revalidateStrategy(tenantId);
  const mapped = mapDocument({
    ...(saved.data as object),
    markdown: text,
    source_file_name:
      (saved.data as { source_file_name?: string | null } | null)?.source_file_name ?? fileName?.trim() ?? null,
  });
  if (!mapped) return { ok: false, error: "Het bestand is niet opgeslagen." };
  return { ok: true, data: mapped };
}

function revalidateStrategy(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie`);
  revalidatePath(`/klanten/${tenantId}`);
}
