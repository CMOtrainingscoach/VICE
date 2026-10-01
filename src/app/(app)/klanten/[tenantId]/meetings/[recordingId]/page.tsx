import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MeetingReviewWorkspace } from "@/components/meetings/meeting-review-workspace";
import { MeetingRecordingDeleteButton } from "@/components/meetings/meeting-recording-delete-button";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/recording/config";
import type { TenantRow } from "@/lib/types/tenant";

export default async function MeetingReviewPage({
  params,
}: PageProps<"/klanten/[tenantId]/meetings/[recordingId]">) {
  const { tenantId, recordingId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenantData) notFound();

  const { data: rec } = await supabase
    .schema("app")
    .from("meeting_recordings")
    .select(
      "title, subject, notes, full_text, token_count, duration_ms, transcript_status, review_status, analysis_status, summary_text, action_items, created_at",
    )
    .eq("id", recordingId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!rec) notFound();

  const tenantName = (tenantData as Pick<TenantRow, "name">).name;
  const displayTitle =
    (rec.title as string)?.trim() ||
    new Date(rec.created_at as string).toLocaleString("nl-BE");
  const actionItems = (rec.action_items as { text: string; done?: boolean }[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <nav className="mb-4 flex items-center justify-between gap-4 text-sm">
        <Link
          href={`/klanten/${tenantId}/meetings`}
          className="text-vice-text-muted hover:text-vice-text"
        >
          ← Meetings
        </Link>
        <MeetingRecordingDeleteButton tenantId={tenantId} recordingId={recordingId} />
      </nav>

      <header className="mb-8">
        <p className="text-sm text-vice-text-muted">Klanten / {tenantName}</p>
        <h1 className="mt-1 text-2xl font-semibold text-vice-text">{displayTitle}</h1>
        <p className="mt-2 text-xs text-vice-text-muted">
          {formatDuration(Number(rec.duration_ms))} · {Number(rec.token_count)} tokens ·{" "}
          {new Date(rec.created_at as string).toLocaleString("nl-BE")}
        </p>
      </header>

      <MeetingReviewWorkspace
        tenantId={tenantId}
        recordingId={recordingId}
        initialTitle={(rec.title as string) ?? ""}
        initialSubject={(rec.subject as string) ?? ""}
        initialNotes={(rec.notes as string) ?? ""}
        initialFullText={(rec.full_text as string) ?? ""}
        reviewStatus={rec.review_status as string}
        analysisStatus={rec.analysis_status as string}
        summaryText={(rec.summary_text as string) ?? null}
        actionItems={actionItems}
        canEditTranscript={rec.transcript_status === "ready" && Boolean(rec.full_text)}
      />
    </div>
  );
}
