import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MeetingRecordingDeleteButton } from "@/components/meetings/meeting-recording-delete-button";
import { getUserAppContext } from "@/lib/auth/context";
import { formatDuration } from "@/lib/recording/config";
import {
  analysisStatusLabel,
  reviewStatusLabel,
  transcriptStatusLabel,
} from "@/lib/meetings/status-labels";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";
import { Button } from "@/components/ui/button";

type RecordingRow = {
  id: string;
  title: string;
  subject: string;
  duration_ms: number;
  transcript_status: string;
  review_status: string;
  analysis_status: string;
  token_count: number;
  created_at: string;
};

function recordingLabel(r: RecordingRow) {
  const t = r.title?.trim();
  if (t) return t;
  return new Date(r.created_at).toLocaleString("nl-BE");
}

export default async function MeetingsOverviewPage({
  params,
}: PageProps<"/klanten/[tenantId]/meetings">) {
  const { tenantId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenantData) notFound();
  const tenant = tenantData as TenantRow;

  const { data: recordings } = await supabase
    .schema("app")
    .from("meeting_recordings")
    .select(
      "id, title, subject, duration_ms, transcript_status, review_status, analysis_status, token_count, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const rows = (recordings ?? []) as RecordingRow[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-vice-text-muted">
            Klanten / {tenant.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-vice-text">Meetings</h1>
          <p className="mt-2 text-sm text-vice-text-muted">
            Overzicht van opnames, transcript review en analyse.
          </p>
        </div>
        <Button asChild>
          <Link href={`/klanten/${tenantId}/meetings/nieuw`}>Nieuwe opname</Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-vice-text-muted">Nog geen meetings.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-vice-border bg-vice-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-vice-border bg-vice-surface-muted/50 text-vice-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Meeting</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Duur</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Transcript</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Review</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Analyse</th>
                <th className="px-4 py-3 font-medium">Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-vice-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/klanten/${tenantId}/meetings/${r.id}`}
                      className="font-medium text-vice-text hover:text-vice-gold"
                    >
                      {recordingLabel(r)}
                    </Link>
                    {r.subject?.trim() && (
                      <p className="truncate text-xs text-vice-text-muted">{r.subject}</p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-vice-text-muted sm:table-cell">
                    {formatDuration(r.duration_ms)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-vice-text-muted md:table-cell">
                    {transcriptStatusLabel(r.transcript_status)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-vice-text-muted md:table-cell">
                    {reviewStatusLabel(r.review_status)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-vice-text-muted lg:table-cell">
                    {analysisStatusLabel(r.analysis_status)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5">
                      <Button
                        asChild
                        variant="ghost"
                        className="size-8 shrink-0 p-0 text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-gold"
                      >
                        <Link
                          href={`/klanten/${tenantId}/meetings/${r.id}`}
                          aria-label="Bewerken"
                          title="Bewerken"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Link>
                      </Button>
                      <MeetingRecordingDeleteButton
                        tenantId={tenantId}
                        recordingId={r.id}
                        iconOnly
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
