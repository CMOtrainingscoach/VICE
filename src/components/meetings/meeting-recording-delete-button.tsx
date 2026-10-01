"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteMeetingRecordingAction } from "@/modules/meetings/actions";

export function MeetingRecordingDeleteButton({
  tenantId,
  recordingId,
  iconOnly = false,
}: {
  tenantId: string;
  recordingId: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (
      !window.confirm(
        "Deze meeting permanent verwijderen? Transcript en tokens worden gewist.",
      )
    ) {
      return;
    }
    setLoading(true);
    const result = await deleteMeetingRecordingAction({ tenantId, recordingId });
    setLoading(false);
    if (result.ok) {
      router.push(`/klanten/${tenantId}/meetings`);
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        iconOnly
          ? "size-8 shrink-0 p-0 text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-danger"
          : "text-xs text-vice-danger hover:bg-vice-surface-muted",
      )}
      disabled={loading}
      onClick={onDelete}
      aria-label={iconOnly ? "Verwijderen" : undefined}
      title={iconOnly ? "Verwijderen" : undefined}
    >
      {loading ? (
        "…"
      ) : iconOnly ? (
        <Trash2 className="size-4" aria-hidden />
      ) : (
        "Verwijderen"
      )}
    </Button>
  );
}
