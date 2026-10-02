import { cn } from "@/lib/utils";

export const fieldClass = "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold disabled:opacity-60";
export const goldButtonClass = "bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold";

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "green" | "amber" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-vice-surface-muted text-vice-text-muted",
        tone === "gold" && "bg-vice-gold/15 text-[#8a6a1a] dark:text-vice-gold",
        tone === "green" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
        tone === "amber" && "bg-amber-500/15 text-amber-900 dark:text-amber-100",
      )}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-vice-text-muted">{label}</span>
      {children}
    </label>
  );
}
