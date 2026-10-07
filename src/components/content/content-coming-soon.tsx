import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ContentComingSoon({
  tenantId,
  tenantName,
  title,
}: {
  tenantId: string;
  tenantName: string;
  title: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Content / {title}
      </p>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-vice-gold">
        Content
      </p>
      <h1 className="mt-3 font-display text-4xl tracking-tight text-vice-text">{title}</h1>
      <p className="mt-3 max-w-prose text-sm text-vice-text-muted">
        Dit scherm volgt later. De contenttypes op het overzicht tonen al welke modules er komen.
      </p>
      <Button asChild variant="secondary" className="mt-8">
        <Link href={`/klanten/${tenantId}/content`}>Terug naar Content</Link>
      </Button>
    </div>
  );
}
