"use client";

import {
  PALETTE_BRONNEN,
  PALETTE_RESULTAAT,
  PALETTE_VERWERKING,
} from "@/lib/salesbrain/nodes/display-meta";
import type { SbNodeType } from "@/lib/salesbrain/types";
import { cn } from "@/lib/utils";

function PaletteItem({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-vice-border bg-vice-bg px-3 py-2 text-left text-sm text-vice-text transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-vice-gold/50 hover:bg-vice-surface",
      )}
    >
      {label}
      {disabled ? <span className="ml-1 text-xs text-vice-text-muted">(binnenkort)</span> : null}
    </button>
  );
}

export function SbPalette({ onPickType }: { onPickType?: (type: SbNodeType) => void }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-vice-border bg-vice-sidebar/80 p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-vice-text-muted">Bronnen</p>
      <ul className="mt-2 space-y-1.5">
        {PALETTE_BRONNEN.map((item) => (
          <li key={item.type}>
            <PaletteItem
              label={item.label}
              disabled={item.disabled}
              onClick={() => onPickType?.(item.type)}
            />
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-vice-text-muted">Verwerking</p>
      <ul className="mt-2 space-y-1.5">
        {PALETTE_VERWERKING.map((item) => (
          <li key={item.type}>
            <PaletteItem label={item.label} onClick={() => onPickType?.(item.type)} />
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-vice-text-muted">Resultaat</p>
      <ul className="mt-2 space-y-1.5">
        {PALETTE_RESULTAAT.map((item) => (
          <li key={item.type}>
            <PaletteItem label={item.label} onClick={() => onPickType?.(item.type)} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
