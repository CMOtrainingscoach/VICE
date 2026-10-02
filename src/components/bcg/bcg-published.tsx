import { BcgMatrix } from "@/components/bcg/bcg-matrix";
import { BCG_QUADRANT_META, type BcgQuadrant } from "@/lib/bcg/constants";
import { formatMultiple, formatPercent, matrixPosition, quadrantOf } from "@/lib/bcg/math";
import type { BcgPublished } from "@/lib/bcg/types";

export function BcgPublishedView({ data }: { data: BcgPublished }) {
  if (!data.published) return null;
  const showFigures = Boolean(data.figures_included && data.growth_threshold != null && data.share_threshold != null && !data.qualitative);
  const points = showFigures ?
    (data.items ?? []).flatMap((item) => {
      if (!item.placeable || item.growth == null || item.relative == null) return [];
      const quadrant = quadrantOf(item.growth, item.relative, data.growth_threshold ?? 0, data.share_threshold ?? 1);
      const pos = matrixPosition(item.growth, item.relative, data.growth_threshold ?? 0, data.share_threshold ?? 1);
      return [{ id: item.title, name: item.title, quadrant, x: pos.x, y: pos.y, provisional: item.growth_evidence === "estimate" || item.growth_evidence === "forecast" || item.share_evidence === "estimate" || item.share_evidence === "forecast" }];
    })
  : [];

  return (
    <section className="mb-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">BCG-matrix · versie {data.version_number}</p>
      <h2 className="mt-2 text-lg font-medium text-vice-text">{data.scope_label || data.market_label || "Portfolio"}</h2>
      <p className="mt-1 text-sm text-vice-text-muted">
        {[data.market_label, data.period_label].filter(Boolean).join(" · ")}
        {data.published_at ? ` · vrijgegeven ${new Date(data.published_at).toLocaleDateString("nl-BE")}` : ""}
      </p>
      {data.qualitative ? (
        <p className="mt-4 text-sm">{data.qualitative_reason} Dit is geen kwantitatief onderbouwde BCG-matrix.</p>
      ) : showFigures ? (
        <div className="mt-4">
          <BcgMatrix points={points} spreadLabels={false} growthLabel={formatPercent(data.growth_threshold ?? 0)} shareLabel={formatMultiple(data.share_threshold ?? 1)} />
          <p className="mt-2 text-xs text-vice-text-muted">Puntgrootte heeft geen financiële betekenis. Een kwadrant is geen besluit om te investeren of te stoppen.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-vice-text-muted">De plaatsing is goedgekeurd. De cijfers zelf zijn niet vrijgegeven.</p>
      )}
      {data.synthesis && <p className="mt-4 whitespace-pre-wrap text-sm text-vice-text">{data.synthesis}</p>}
      <ul className="mt-4 space-y-2 text-sm">
        {(data.items ?? []).map((item) => (
          <li key={item.title}>
            <span className="font-medium">{item.title}</span>
            {showFigures && item.placeable && item.growth != null && item.relative != null ? (
              <span className="text-vice-text-muted"> · {BCG_QUADRANT_META[quadrantOf(item.growth, item.relative, data.growth_threshold ?? 0, data.share_threshold ?? 1) as BcgQuadrant].label}</span>
            ) : null}
            {!item.placeable && item.gap_reason ? <span className="text-vice-text-muted"> · niet plaatsbaar: {item.gap_reason}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
