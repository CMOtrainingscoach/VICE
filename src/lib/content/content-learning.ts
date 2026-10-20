import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { resolveBlogTextModel, modelSupportsCustomTemperature } from "@/lib/openai/models";
import type {
  BlogTextSnapshot,
  ContentKind,
  ContentLearningTrigger,
  SocialTextSnapshot,
} from "@/lib/content/content-learning-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const learningSchema = z.object({
  learningText: z.string().min(8).max(800),
  tags: z.array(z.string().min(1).max(40)).max(8),
});

function normalizePlain(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  const t = normalizePlain(text);
  if (!t) return 0;
  return t.split(" ").filter(Boolean).length;
}

export function buildLearningDedupeKey(input: {
  contentKind: ContentKind;
  conceptId: string;
  baseline: unknown;
  final: unknown;
}): string {
  const payload = JSON.stringify({
    kind: input.contentKind,
    conceptId: input.conceptId,
    baseline: input.baseline,
    final: input.final,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function meaningfulTextDiff(baselineText: string, finalText: string): boolean {
  const a = normalizePlain(baselineText);
  const b = normalizePlain(finalText);
  if (!a || !b) return false;
  if (a === b) return false;

  const wordsA = wordCount(a);
  const wordsB = wordCount(b);
  const delta = Math.abs(wordsB - wordsA);
  if (delta < 8 && a.length > 40) {
    const longer = Math.max(a.length, b.length);
    let same = 0;
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) same++;
    }
    const similarity = same / longer;
    if (similarity > 0.98) return false;
  }

  const maxWords = Math.max(wordsA, wordsB, 1);
  const ratio = delta / maxWords;
  if (ratio < 0.02 && delta < 12) return false;
  return true;
}

export function buildDiffSummary(baselineText: string, finalText: string, maxLines = 12): string {
  const a = normalizePlain(baselineText);
  const b = normalizePlain(finalText);
  if (a === b) return "";
  const aWords = a.split(" ");
  const bWords = b.split(" ");
  const lines: string[] = [];
  const len = Math.max(aWords.length, bWords.length);
  for (let i = 0; i < len && lines.length < maxLines; i++) {
    const aw = aWords[i] ?? "";
    const bw = bWords[i] ?? "";
    if (aw !== bw) {
      lines.push(`~ "${aw || "…"}" → "${bw || "…"}"`);
    }
  }
  if (lines.length === 0) {
    return `Lengte: ${aWords.length} → ${bWords.length} woorden`;
  }
  return lines.join("\n");
}

export function blogSnapshotFromParts(title: string, bodyPlain: string): BlogTextSnapshot {
  return { title: title.trim(), bodyPlain: normalizePlain(bodyPlain) };
}

export function socialSnapshotFromParts(caption: string, hashtags: string): SocialTextSnapshot {
  return { caption: caption.trim(), hashtags: hashtags.trim() };
}

export function snapshotToComparableText(
  kind: ContentKind,
  snapshot: BlogTextSnapshot | SocialTextSnapshot,
): string {
  if (kind === "blog") {
    const s = snapshot as BlogTextSnapshot;
    return normalizePlain(`${s.title}\n\n${s.bodyPlain}`);
  }
  const s = snapshot as SocialTextSnapshot;
  return normalizePlain(`${s.caption}\n\n${s.hashtags}`);
}

export async function extractContentLearning(input: {
  contentKind: ContentKind;
  voiceSnippet?: string;
  baseline: BlogTextSnapshot | SocialTextSnapshot;
  final: BlogTextSnapshot | SocialTextSnapshot;
  diffSummary: string;
}): Promise<{ learningText: string; tags: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const openai = new OpenAI({ apiKey });
  const model = resolveBlogTextModel();
  const baselineText = snapshotToComparableText(input.contentKind, input.baseline);
  const finalText = snapshotToComparableText(input.contentKind, input.final);

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.2 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je analyseert redactiewijzigingen na AI-gegenereerde content voor VICE.",
          "Formuleer 1–3 zinnen als herbruikbare schrijfregel voor TOEKOMSTIGE AI-teksten (voorkeur van de redacteur).",
          "Geen feiten uit het artikel, geen PII, geen klantnamen tenzij in de diff.",
          "Focus op toon, structuur, zinsbouw, CTA, hashtags, lengte, woordkeuze.",
          "Antwoord JSON: { learningText: string, tags: string[] }.",
          "tags: korte labels zoals tone, structure, cta, hashtags, length, spelling.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Type: ${input.contentKind}`,
          input.voiceSnippet ? `Tone of voice (context):\n${input.voiceSnippet.slice(0, 600)}` : "",
          `AI-voorstel:\n${baselineText.slice(0, 6000)}`,
          `Finale versie:\n${finalText.slice(0, 6000)}`,
          `Diff:\n${input.diffSummary.slice(0, 1500)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen learning van het model ontvangen.");
  const parsed = learningSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Learning JSON ongeldig.");
  return parsed.data;
}

export async function recordContentLearningIfNeeded(input: {
  supabase: SupabaseClient;
  tenantId: string;
  brandId: string | null;
  contentKind: ContentKind;
  conceptId: string;
  trigger: ContentLearningTrigger;
  baseline: BlogTextSnapshot | SocialTextSnapshot | null | undefined;
  final: BlogTextSnapshot | SocialTextSnapshot;
  voiceSnippet?: string;
}): Promise<void> {
  if (!input.baseline) return;
  const baselineText = snapshotToComparableText(input.contentKind, input.baseline);
  const finalText = snapshotToComparableText(input.contentKind, input.final);
  if (!meaningfulTextDiff(baselineText, finalText)) return;

  const diffSummary = buildDiffSummary(baselineText, finalText);
  const dedupeKey = buildLearningDedupeKey({
    contentKind: input.contentKind,
    conceptId: input.conceptId,
    baseline: input.baseline,
    final: input.final,
  });

  try {
    const extracted = await extractContentLearning({
      contentKind: input.contentKind,
      voiceSnippet: input.voiceSnippet,
      baseline: input.baseline,
      final: input.final,
      diffSummary,
    });

    const result = await input.supabase.schema("app").rpc("insert_content_learning_event", {
      p_tenant_id: input.tenantId,
      p_brand_id: input.brandId,
      p_content_kind: input.contentKind,
      p_concept_id: input.conceptId,
      p_trigger_kind: input.trigger,
      p_baseline_snapshot: input.baseline,
      p_final_snapshot: input.final,
      p_diff_summary: diffSummary,
      p_learning_text: extracted.learningText,
      p_learning_tags: extracted.tags,
      p_dedupe_key: dedupeKey,
    });
    if (result.error) {
      console.error("insert_content_learning_event", result.error.message);
    }
  } catch (error) {
    console.error("recordContentLearningIfNeeded", error);
  }
}

export async function fetchContentLearningPromptBlock(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const result = await supabase.schema("app").rpc("get_content_learning_prompt_block", {
    p_tenant_id: tenantId,
  });
  if (result.error) return "";
  return String(result.data ?? "").trim();
}

export function parseBaselineFromRow(
  kind: ContentKind,
  raw: unknown,
): BlogTextSnapshot | SocialTextSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (kind === "blog") {
    const title = String(row.title ?? "").trim();
    const bodyPlain = String(row.bodyPlain ?? "").trim();
    if (!title && !bodyPlain) return null;
    return { title, bodyPlain };
  }
  const caption = String(row.caption ?? "").trim();
  const hashtags = String(row.hashtags ?? "").trim();
  if (!caption && !hashtags) return null;
  return { caption, hashtags };
}
