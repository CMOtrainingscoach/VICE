import Link from "next/link";
import { VC_REF_TYPE_LABELS, type VcRefType } from "@/lib/value-chain/constants";
import { cn } from "@/lib/utils";

export const textareaClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm disabled:opacity-60";
export const goldButtonClass = "bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "green" | "amber" | "rose" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
        tone === "neutral" && "border-vice-border text-vice-text-muted",
        tone === "gold" && "border-vice-gold/40 bg-vice-gold/10 text-vice-text",
        tone === "green" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        tone === "amber" && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "rose" && "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200",
      )}
    >
      {children}
    </span>
  );
}

export function refHref(tenantId: string, refType: VcRefType, refId: string | null): string | null {
  if (refType === "meeting" && refId) return `/klanten/${tenantId}/meetings/${refId}`;
  if (refType === "pestel_insight" || refType === "pestel_input") return `/klanten/${tenantId}/strategie/pestel`;
  if (refType === "porter_scope" || refType === "porter_force" || refType === "porter_factor") return `/klanten/${tenantId}/strategie/porter`;
  if (refType === "five_c_item" || refType === "five_c_synthesis") return `/klanten/${tenantId}/strategie/marketing-5c`;
  if (refType === "swot_item") return `/klanten/${tenantId}/strategie/swot`;
  if (refType === "vrio_resource") return `/klanten/${tenantId}/strategie/vrio`;
  if (refType === "tenant_profile") return `/klanten/${tenantId}`;
  return null;
}

export function RefChip({ tenantId, refType, label }: { tenantId: string; refType: VcRefType; label: string }) {
  const href = refHref(tenantId, refType, null);
  const text = label || VC_REF_TYPE_LABELS[refType];
  if (!href) return <Chip>{text}</Chip>;
  return (
    <Link href={href} className="inline-flex">
      <Chip tone="gold">{text}</Chip>
    </Link>
  );
}
