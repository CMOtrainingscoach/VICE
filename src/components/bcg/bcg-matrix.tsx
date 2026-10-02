import { BCG_QUADRANT_META, type BcgQuadrant } from "@/lib/bcg/constants";
import { cn } from "@/lib/utils";

export type MatrixPoint = {
  id: string;
  name: string;
  quadrant: BcgQuadrant;
  x: number;
  y: number;
  provisional: boolean;
};

const QUADRANT_BG: Record<BcgQuadrant, string> = {
  star: "bg-emerald-500/15",
  question_mark: "bg-rose-500/10",
  cash_cow: "bg-amber-500/15",
  dog: "bg-rose-400/10",
};

export function BcgMatrix({
  points,
  growthLabel,
  shareLabel,
  spreadLabels,
  onSelect,
}: {
  points: MatrixPoint[];
  growthLabel: string;
  shareLabel: string;
  spreadLabels: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-6 flex-col items-center justify-between py-2 text-[10px] text-vice-text-muted">
          <span className="[writing-mode:vertical-rl] rotate-180">Marktgroei</span>
          <span>Hoog</span>
          <span>Laag</span>
        </div>
        <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-xl border border-vice-border">
          <div className="grid h-full min-h-[320px] grid-cols-2 grid-rows-2">
            {(["star", "question_mark", "cash_cow", "dog"] as const).map((key) => (
              <div key={key} className={cn("relative border-vice-border p-3", QUADRANT_BG[key], key === "star" || key === "cash_cow" ? "border-r" : "", key === "star" || key === "question_mark" ? "border-b" : "")}>
                <p className="text-sm font-medium text-vice-text">{BCG_QUADRANT_META[key].label}</p>
              </div>
            ))}
          </div>
          {points.map((point, index) => (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect?.(point.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={point.name}
            >
              <span className={cn("block size-3 rounded-full border border-white/80 bg-emerald-700 dark:bg-emerald-300", point.provisional && "bg-amber-600")} />
              <span
                className="absolute left-4 top-1/2 max-w-32 -translate-y-1/2 truncate text-left text-[11px] font-medium text-vice-text"
                style={spreadLabels ? { top: `${(index % 3) * 14 - 8}px` } : undefined}
              >
                {point.name}
              </span>
            </button>
          ))}
          <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-vice-surface/80 px-2 text-[10px] text-vice-text-muted">{growthLabel}</p>
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-vice-surface/80 px-2 text-[10px] text-vice-text-muted">{shareLabel}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-vice-text-muted">
        <span className="pl-8">Hoog</span>
        <span>Relatief marktaandeel</span>
        <span>Laag</span>
      </div>
    </div>
  );
}
