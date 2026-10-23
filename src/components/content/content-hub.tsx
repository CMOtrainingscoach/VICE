"use client";

import Link from "next/link";
import { ArrowRight, FilePenLine, ImageIcon, Mail, MessageSquare } from "lucide-react";
import { contentTypes, type ContentTypeId } from "@/lib/content/types";

const ICONS: Record<ContentTypeId, typeof MessageSquare> = {
  social: MessageSquare,
  blog: FilePenLine,
  email: Mail,
  beeld: ImageIcon,
};

export function ContentHub({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const types = contentTypes(tenantId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Content
      </p>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-vice-gold">
        Content
      </p>
      <h1 className="mt-3 font-display text-4xl tracking-tight text-vice-text md:text-5xl">
        Wat wil je maken?
      </h1>
      <p className="mt-3 text-sm text-vice-text-muted">
        Kies een contenttype om te beginnen.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {types.map((item) => {
          const Icon = ICONS[item.id];
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex min-h-[11rem] flex-col rounded-2xl border border-vice-border bg-vice-surface p-6 transition-colors hover:border-vice-gold"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-vice-gold/15 text-vice-gold">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-5 text-lg font-medium text-vice-text">{item.title}</h2>
              <p className="mt-2 flex-1 text-sm text-vice-text-muted">{item.description}</p>
              <span className="mt-4 inline-flex justify-end text-vice-text-muted transition-colors group-hover:text-vice-gold">
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
