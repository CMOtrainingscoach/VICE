"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ContentLearningEvent } from "@/lib/content/content-learning-types";
import { dismissContentLearningAction } from "@/modules/content/content-learning-actions";

export function ContentLearningsPanel({
  tenantId,
  initialEvents,
}: {
  tenantId: string;
  initialEvents: ContentLearningEvent[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function dismiss(eventId: string) {
    setBusy(eventId);
    setError("");
    const result = await dismissContentLearningAction(tenantId, eventId);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEvents((prev) => prev.filter((item) => item.id !== eventId));
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-6">
      <h2 className="text-lg font-medium">Contentleerlog</h2>
      <p className="mt-1 text-sm text-vice-text-muted">
        Na AI-generatie en jouw redactie (opslaan of publiceren) leert VICE voorkeuren voor toekomstige blog- en
        socialteksten. Verberg regels die niet meer gelden.
      </p>
      {error ? (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-vice-text-muted">
          Nog geen leerpunten. Genereer content, pas aan en sla op — dan verschijnen ze hier.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-vice-border px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-vice-text-muted">
                <span>{new Date(event.createdAt).toLocaleString("nl-BE")}</span>
                <span>·</span>
                <span>{event.contentKind === "blog" ? "Blog" : "Social"}</span>
                <span>·</span>
                <span>{event.triggerKind === "publish" ? "Publicatie" : "Opslaan"}</span>
                {event.learningTags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full border border-vice-border px-2 py-0.5">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-vice-text">{event.learningText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={
                    event.contentKind === "blog"
                      ? `/klanten/${tenantId}/content/blog/${event.conceptId}`
                      : `/klanten/${tenantId}/content/social/${event.conceptId}`
                  }
                  className="text-xs font-medium text-vice-gold underline"
                >
                  Naar concept
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  disabled={busy === event.id}
                  onClick={() => void dismiss(event.id)}
                >
                  Verbergen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
