import Link from "next/link";
import { BCG_REF_TYPE_LABELS, type BcgRefType } from "@/lib/bcg/constants";
import { cn } from "@/lib/utils";

export const fieldClass = "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm disabled:opacity-60";
export const goldButtonClass = "bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
}

export function refHref(tenantId: string, refType: BcgRefType, refId: string | null): string | null {
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
    case "five_c_item":
    case "five_c_synthesis":
      return `/klanten/${tenantId}/strategie/marketing-5c`;
    case "swot_item":
      return `/klanten/${tenantId}/strategie/swot`;
    case "vrio_resource":
      return `/klanten/${tenantId}/strategie/vrio`;
    case "tenant_profile":
      return `/klanten/${tenantId}`;
    default:
      return null;
  }
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "green" | "amber" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-vice-surface-muted text-vice-text-muted",
        tone === "gold" && "bg-vice-gold/15 text-vice-gold",
        tone === "green" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "amber" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
      )}
    >
      {children}
    </span>
  );
}

export function RefChip({
  tenantId,
  refType,
  refId,
  label,
  onRemove,
}: {
  tenantId: string;
  refType: BcgRefType;
  refId: string | null;
  label: string;
  onRemove?: () => void;
}) {
  const href = refHref(tenantId, refType, refId);
  const cls = "inline-flex max-w-full items-center gap-1 rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-[11px]";
  const body = (
    <>
      <span className="font-medium text-vice-text-muted">{BCG_REF_TYPE_LABELS[refType]}</span>
      <span className="truncate">{label.replace(/^[^·]*· /, "")}</span>
    </>
  );
  return (
    <span className="inline-flex items-center gap-1">
      {href ?
        <Link href={href} className={cn(cls, "hover:border-vice-gold/60 hover:text-vice-gold")}>
          {body}
        </Link>
      : <span className={cls}>{body}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded px-1 text-[11px] text-vice-text-muted hover:text-rose-600" aria-label="Bron loskoppelen">
          ×
        </button>
      )}
    </span>
  );
}
