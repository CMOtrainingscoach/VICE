import Link from "next/link";
import { VRIO_REF_TYPE_LABELS, type VrioOutcome, type VrioRefType } from "@/lib/vrio/constants";
import { cn } from "@/lib/utils";

export const textareaClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm disabled:opacity-60";

export const goldButtonClass = "bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover";

export function refHref(tenantId: string, refType: VrioRefType, refId: string | null): string | null {
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

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "green" | "amber" | "red" | "violet";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-vice-surface-muted text-vice-text-muted",
        tone === "gold" && "bg-vice-gold/15 text-vice-gold",
        tone === "green" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "amber" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        tone === "red" && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        tone === "violet" && "bg-violet-500/15 text-violet-800 dark:text-violet-200",
        className,
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
  refType: VrioRefType;
  refId: string | null;
  label: string;
  onRemove?: () => void;
}) {
  const href = refHref(tenantId, refType, refId);
  const cls =
    "inline-flex max-w-full items-center gap-1 rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-[11px]";
  const body = (
    <>
      <span className="font-medium text-vice-text-muted">{VRIO_REF_TYPE_LABELS[refType]}</span>
      <span className="truncate">{label.replace(/^[^·]*· /, "")}</span>
    </>
  );
  return (
    <span className="inline-flex items-center gap-1">
      {href ?
        <Link href={href} className={cn(cls, "hover:border-vice-gold/60 hover:text-vice-gold")} title={label}>
          {body}
        </Link>
      : <span className={cls} title={label}>
          {body}
        </span>
      }
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-1 text-[11px] text-vice-text-muted hover:text-rose-600"
          aria-label={`Bron ${label} loskoppelen`}
        >
          ×
        </button>
      )}
    </span>
  );
}

const OUTCOME_TONES: Record<VrioOutcome, string> = {
  disadvantage: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  parity: "bg-vice-surface-muted text-vice-text-muted",
  temporary: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  unused_potential: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
  sustained: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  undetermined: "bg-vice-surface-muted text-vice-text-muted",
};

export function OutcomeBadge({ outcome, label }: { outcome: VrioOutcome; label: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", OUTCOME_TONES[outcome])}>
      {label}
    </span>
  );
}
