import { Building2, Globe2, Handshake, Swords, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { FIVE_C_REF_TYPE_LABELS, type FiveCKey, type FiveCRefType } from "@/lib/marketing-5c/constants";
import { cn } from "@/lib/utils";

export const FIVE_C_ICONS: Record<FiveCKey, LucideIcon> = {
  company: Building2,
  customers: Users,
  competitors: Swords,
  collaborators: Handshake,
  context: Globe2,
};

export function refHref(tenantId: string, refType: FiveCRefType, refId: string | null): string | null {
  switch (refType) {
    case "meeting":
      return refId ? `/klanten/${tenantId}/meetings/${refId}` : null;
    case "pestel_insight":
    case "pestel_input":
      return `/klanten/${tenantId}/strategie/pestel`;
    case "porter_scope":
    case "porter_force":
    case "porter_factor":
      return `/klanten/${tenantId}/strategie/porter`;
    case "tenant_profile":
      return `/klanten/${tenantId}`;
    default:
      return null;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
}

export function RefChip({
  tenantId,
  refType,
  refId,
  label,
  date,
}: {
  tenantId: string;
  refType: FiveCRefType;
  refId: string | null;
  label: string;
  date?: string | null;
}) {
  const href = refHref(tenantId, refType, refId);
  const body = (
    <>
      <span className="font-medium text-vice-text-muted">{FIVE_C_REF_TYPE_LABELS[refType]}</span>
      <span className="truncate">{label.replace(/^[^·]*· /, "")}</span>
      {date && <span className="text-vice-text-muted">· {formatDate(date)}</span>}
    </>
  );
  const cls =
    "inline-flex max-w-full items-center gap-1 rounded-md border border-vice-border bg-vice-bg px-2 py-0.5 text-[11px]";
  return href ?
      <Link href={href} className={cn(cls, "hover:border-vice-gold/60 hover:text-vice-gold")} title={label}>
        {body}
      </Link>
    : <span className={cls} title={label}>
        {body}
      </span>;
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "green" | "amber" | "red" | "violet" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-vice-surface-muted text-vice-text-muted",
        tone === "gold" && "bg-vice-gold/15 text-vice-gold",
        tone === "green" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "amber" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        tone === "red" && "bg-red-500/15 text-red-700 dark:text-red-300",
        tone === "violet" && "bg-violet-500/15 text-violet-800 dark:text-violet-200",
      )}
    >
      {children}
    </span>
  );
}

export const textareaClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm disabled:opacity-60";

export const selectClass = "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm";

export const goldButtonClass = "bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover";
