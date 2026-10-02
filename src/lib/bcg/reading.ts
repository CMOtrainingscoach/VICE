import type { BcgItem, BcgVersion } from "@/lib/bcg/types";
import { parseBcgNumber, placeItem, type Placement } from "@/lib/bcg/math";

export function readingFor(item: BcgItem, version: BcgVersion): Placement {
  return placeItem({
    growth: {
      method: item.growth_method,
      directPercent: parseBcgNumber(item.growth_percent),
      previousSize: parseBcgNumber(item.size_previous),
      currentSize: parseBcgNumber(item.size_current),
      previousScale: item.size_scale,
      currentScale: item.size_scale,
    },
    share: {
      method: item.share_method,
      ownSharePercent: parseBcgNumber(item.own_share),
      leaderSharePercent: parseBcgNumber(item.leader_share),
      ownAmount: parseBcgNumber(item.own_amount),
      leaderAmount: parseBcgNumber(item.leader_amount),
      ownScale: item.amount_scale,
      leaderScale: item.amount_scale,
    },
    growthThreshold: parseBcgNumber(version.growth_threshold),
    shareThreshold: parseBcgNumber(version.share_threshold),
    thresholdsConfirmed: version.thresholds_confirmed,
    growthEvidence: item.growth_evidence,
    shareEvidence: item.share_evidence,
    scopeConfirmed: item.scope_confirmed,
    periodKind: item.period_kind,
    versionPeriodKind: version.period_kind,
    measureBasis: item.measure_basis,
    conflict: item.figures_conflict,
    conflictAccepted: item.conflict_accepted,
    leaderName: item.leader_name,
    clientIsLeader: item.client_is_leader,
  });
}
