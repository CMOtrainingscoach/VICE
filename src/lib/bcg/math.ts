import type { BcgEvidence, BcgOverlapMode, BcgQuadrant, BcgScale } from "@/lib/bcg/constants";
import { BCG_QUADRANT_META } from "@/lib/bcg/constants";

export type GrowthMethod = "none" | "direct" | "from_size";
export type ShareMethod = "none" | "from_shares" | "from_amounts";

export type GrowthInput = {
  method: GrowthMethod;
  directPercent: number | null;
  previousSize: number | null;
  currentSize: number | null;
  previousScale: BcgScale;
  currentScale: BcgScale;
};

export type ShareInput = {
  method: ShareMethod;
  ownSharePercent: number | null;
  leaderSharePercent: number | null;
  ownAmount: number | null;
  leaderAmount: number | null;
  ownScale: BcgScale;
  leaderScale: BcgScale;
};

export type CalcResult = {
  value: number | null;
  formula: string;
  reason: string | null;
};

export type PlacementInput = {
  growth: GrowthInput;
  share: ShareInput;
  growthThreshold: number | null;
  shareThreshold: number | null;
  thresholdsConfirmed: boolean;
  growthEvidence: BcgEvidence | "";
  shareEvidence: BcgEvidence | "";
  scopeConfirmed: boolean;
  periodKind: string;
  versionPeriodKind: string;
  measureBasis: string;
  conflict: string;
  conflictAccepted: boolean;
  leaderName: string;
  clientIsLeader: boolean;
};

export type Placement = {
  growth: number | null;
  growthFormula: string;
  growthReason: string | null;
  relative: number | null;
  relativeFormula: string;
  relativeReason: string | null;
  previewQuadrant: BcgQuadrant | null;
  placeable: boolean;
  reasons: string[];
  provisional: boolean;
  sensitive: boolean;
  explanation: string;
};

export type OverlapItem = {
  id: string;
  selected: boolean;
  parentId: string | null;
  overlapKey: string;
  overlapMode: BcgOverlapMode;
};

const SCALE_MISMATCH = "Duizenden en miljoenen worden niet vermengd.";

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Leeg of onbekend is null. Een expliciete 0 blijft 0. Een punt is een decimaal, geen duizendtal. */
export function parseBcgNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let t = raw.trim().toLowerCase();
  if (!t || t === "?" || t === "onbekend" || t === "nvt" || t === "n.v.t.") return null;
  t = t.replaceAll("×", "").replaceAll("%", "").replaceAll("−", "-").replace(/\s/g, "");
  if (!t || t.startsWith("=")) return null;
  if (t.includes(",") && t.includes(".")) {
    t = t.replaceAll(".", "").replace(",", ".");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function canonicalBcgNumber(raw: string | null | undefined): string | null {
  const n = parseBcgNumber(raw);
  if (n == null) return null;
  return String(round4(n));
}

export function formatNl(n: number): string {
  const negative = n < 0;
  const rounded = round4(Math.abs(n));
  const [whole, frac = ""] = rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = frac ? `${grouped},${frac}` : grouped;
  return negative ? `−${body}` : body;
}

export function formatPercent(n: number): string {
  return `${formatNl(n)}%`;
}

export function formatMultiple(n: number): string {
  return `${formatNl(n)}×`;
}

export function marketGrowth(input: GrowthInput): CalcResult {
  if (input.method === "direct") {
    if (input.directPercent == null) {
      return { value: null, formula: "", reason: "Marktgroei ontbreekt." };
    }
    const value = round4(input.directPercent);
    return {
      value,
      formula: `Marktgroei = ${formatPercent(value)} (rechtstreeks ingevoerd).`,
      reason: null,
    };
  }
  if (input.method === "from_size") {
    if (input.previousScale !== input.currentScale) {
      return { value: null, formula: "", reason: SCALE_MISMATCH };
    }
    if (input.previousSize == null) {
      return { value: null, formula: "", reason: "Vorige marktomvang ontbreekt of is ongeldig." };
    }
    if (input.currentSize == null) {
      return { value: null, formula: "", reason: "Huidige marktomvang ontbreekt of is ongeldig." };
    }
    if (input.previousSize === 0) {
      return { value: null, formula: "", reason: "Vorige marktomvang is nul; er is geen groeipercentage." };
    }
    const value = round4(((input.currentSize - input.previousSize) / input.previousSize) * 100);
    return {
      value,
      formula: `Marktgroei = (${formatNl(input.currentSize)} − ${formatNl(input.previousSize)}) / ${formatNl(input.previousSize)} × 100% = ${formatPercent(value)}.`,
      reason: null,
    };
  }
  return { value: null, formula: "", reason: "Marktgroei ontbreekt." };
}

function shareInRange(n: number): boolean {
  return n >= 0 && n <= 100;
}

export function relativeShare(input: ShareInput): CalcResult {
  if (input.method === "from_shares") {
    if (input.ownSharePercent == null) {
      return { value: null, formula: "", reason: "Eigen marktaandeel is onbekend." };
    }
    if (input.leaderSharePercent == null) {
      return { value: null, formula: "", reason: "Het marktaandeel van de grootste concurrent ontbreekt." };
    }
    if (!shareInRange(input.ownSharePercent) || !shareInRange(input.leaderSharePercent)) {
      return { value: null, formula: "", reason: "Marktaandeel valt buiten 0–100%." };
    }
    if (input.leaderSharePercent === 0) {
      return { value: null, formula: "", reason: "Een noemer van nul geeft geen relatief marktaandeel." };
    }
    const value = round4(input.ownSharePercent / input.leaderSharePercent);
    return {
      value,
      formula: `Relatief marktaandeel = ${formatPercent(input.ownSharePercent)} / ${formatPercent(input.leaderSharePercent)} = ${formatMultiple(value)}.`,
      reason: null,
    };
  }
  if (input.method === "from_amounts") {
    if (input.ownScale !== input.leaderScale) {
      return { value: null, formula: "", reason: "Bedragen hebben niet dezelfde schaal." };
    }
    if (input.ownAmount == null) {
      return { value: null, formula: "", reason: "Eigen omzet of volume is onbekend." };
    }
    if (input.ownAmount < 0 || (input.leaderAmount != null && input.leaderAmount < 0)) {
      return { value: null, formula: "", reason: "Negatieve bedragen zijn geen marktaandeel." };
    }
    if (input.leaderAmount == null || input.leaderAmount === 0) {
      return { value: null, formula: "", reason: "Omzet of volume van de grootste concurrent ontbreekt of is nul." };
    }
    const value = round4(input.ownAmount / input.leaderAmount);
    return {
      value,
      formula: `Relatief marktaandeel = ${formatNl(input.ownAmount)} / ${formatNl(input.leaderAmount)} = ${formatMultiple(value)}.`,
      reason: null,
    };
  }
  return { value: null, formula: "", reason: "Relatief marktaandeel ontbreekt." };
}

export function quadrantOf(growth: number, relative: number, growthThreshold: number, shareThreshold: number): BcgQuadrant {
  const highGrowth = growth >= growthThreshold;
  const highShare = relative >= shareThreshold;
  if (highGrowth && highShare) return "star";
  if (highGrowth) return "question_mark";
  if (highShare) return "cash_cow";
  return "dog";
}

export function matrixPosition(
  growth: number,
  relative: number,
  growthThreshold: number,
  shareThreshold: number,
): { x: number; y: number } {
  const shareSpan = Math.max(shareThreshold, 0.0001);
  let x: number;
  if (relative >= shareThreshold) {
    const maxHigh = Math.max(shareThreshold * 3, relative);
    const denom = maxHigh - shareThreshold || 1;
    x = 50 * (1 - (relative - shareThreshold) / denom);
  } else {
    x = 50 + 50 * (1 - relative / shareSpan);
  }
  const span = Math.max(10, Math.abs(growth - growthThreshold) + 5);
  const y =
    growth >= growthThreshold ?
      50 * (1 - Math.min(1, (growth - growthThreshold) / span))
    : 50 + 50 * Math.min(1, (growthThreshold - growth) / span);
  return { x: clamp(x, 8, 92), y: clamp(y, 10, 90) };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function leaderInconsistent(input: PlacementInput, share: CalcResult): boolean {
  if (!input.clientIsLeader || share.value == null) return false;
  if (input.share.method === "from_shares" && input.share.ownSharePercent != null && input.share.leaderSharePercent != null) {
    return input.share.ownSharePercent <= input.share.leaderSharePercent;
  }
  if (input.share.method === "from_amounts" && input.share.ownAmount != null && input.share.leaderAmount != null) {
    return input.share.ownAmount <= input.share.leaderAmount;
  }
  return false;
}

export function placeItem(input: PlacementInput): Placement {
  const growth = marketGrowth(input.growth);
  const share = relativeShare(input.share);
  const reasons: string[] = [];
  if (input.conflict.trim() && !input.conflictAccepted) {
    reasons.push("Conflicterende cijfers wachten op beoordeling.");
  }
  if (input.versionPeriodKind && input.periodKind && input.versionPeriodKind !== input.periodKind) {
    reasons.push("Periodes sluiten niet aan.");
  }
  if (!input.periodKind) reasons.push("De meetperiode van de groei is niet vastgelegd.");
  if (!input.measureBasis) reasons.push("De meetbasis (waarde of volume) ontbreekt.");
  if (!input.scopeConfirmed) reasons.push("De marktdefinitie is nog niet bevestigd.");
  if (!input.thresholdsConfirmed || input.growthThreshold == null) reasons.push("De groeigrens is nog niet vastgelegd.");
  if (input.shareThreshold == null) reasons.push("De grens voor relatief marktaandeel ontbreekt.");
  if (growth.value == null && growth.reason) reasons.push(growth.reason);
  if (share.value == null && share.reason) reasons.push(share.reason);
  if (!input.leaderName.trim()) reasons.push("De grootste concurrent is niet benoemd.");
  if (leaderInconsistent(input, share)) {
    reasons.push("De klant is als marktleider gemarkeerd, maar het eigen cijfer is niet groter dan de andere concurrent.");
  }

  const previewQuadrant =
    growth.value != null && share.value != null && input.growthThreshold != null && input.shareThreshold != null ?
      quadrantOf(growth.value, share.value, input.growthThreshold, input.shareThreshold)
    : null;

  const provisional = input.growthEvidence === "forecast" || input.growthEvidence === "estimate" || input.shareEvidence === "forecast" || input.shareEvidence === "estimate";
  const sensitive =
    previewQuadrant != null &&
    input.growthThreshold != null &&
    input.shareThreshold != null &&
    growth.value != null &&
    share.value != null &&
    (Math.abs(growth.value - input.growthThreshold) <= 1 || Math.abs(share.value - input.shareThreshold) <= 0.1);

  const placeable = reasons.length === 0 && previewQuadrant != null;
  const explanation = explainPlacement({
    growth: growth.value,
    relative: share.value,
    growthThreshold: input.growthThreshold,
    shareThreshold: input.shareThreshold,
    quadrant: previewQuadrant,
    provisional,
    sensitive,
    placeable,
  });

  return {
    growth: growth.value,
    growthFormula: growth.formula,
    growthReason: growth.reason,
    relative: share.value,
    relativeFormula: share.formula,
    relativeReason: share.reason,
    previewQuadrant,
    placeable,
    reasons,
    provisional,
    sensitive,
    explanation,
  };
}

function explainPlacement(input: {
  growth: number | null;
  relative: number | null;
  growthThreshold: number | null;
  shareThreshold: number | null;
  quadrant: BcgQuadrant | null;
  provisional: boolean;
  sensitive: boolean;
  placeable: boolean;
}): string {
  if (input.growth == null || input.relative == null || input.growthThreshold == null || input.shareThreshold == null || !input.quadrant) {
    return "Zonder groei, relatief aandeel en grenzen is er geen classificatie. Onbekend wordt niet als nul geplaatst.";
  }
  const highGrowth = input.growth >= input.growthThreshold;
  const highShare = input.relative >= input.shareThreshold;
  const lines = [
    `Marktgroei ${formatPercent(input.growth)} ${highGrowth ? "ligt op of boven" : "ligt onder"} de grens van ${formatPercent(input.growthThreshold)}, dus ${highGrowth ? "hoge" : "lage"} groei.`,
    `Relatief marktaandeel ${formatMultiple(input.relative)} ${highShare ? "ligt op of boven" : "ligt onder"} ${formatMultiple(input.shareThreshold)}, dus ${highShare ? "hoog" : "laag"} aandeel.`,
    `Classificatie: ${BCG_QUADRANT_META[input.quadrant].label}. ${BCG_QUADRANT_META[input.quadrant].hint}`,
  ];
  if (input.provisional) {
    lines.push("De classificatie is voorlopig: minstens één cijfer is een prognose of een menselijke schatting.");
  }
  if (input.sensitive) {
    lines.push("Een kleine wijziging rond de grens kan de klasse veranderen.");
  }
  if (!input.placeable) {
    lines.push("Dit is een voorbeeld van de klasse bij de ingevulde cijfers. Plaatsing wacht nog op bevestiging of ontbrekende gegevens.");
  }
  return lines.join(" ");
}

export function unresolvedOverlapIds(items: OverlapItem[]): string[] {
  const selected = items.filter((item) => item.selected);
  const groupOf = new Map<string, string>();
  for (const item of selected) {
    if (item.overlapKey.trim()) {
      groupOf.set(item.id, `k:${item.overlapKey.trim()}`);
      continue;
    }
    if (item.parentId && selected.some((other) => other.id === item.parentId)) {
      groupOf.set(item.id, `p:${item.parentId}`);
      continue;
    }
    if (selected.some((other) => other.parentId === item.id)) {
      groupOf.set(item.id, `p:${item.id}`);
    }
  }
  const groups = new Map<string, OverlapItem[]>();
  for (const item of selected) {
    const key = groupOf.get(item.id);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const bad = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const counting = list.filter((item) => item.overlapMode === "count").length;
    const excluded = list.filter((item) => item.overlapMode === "excluded").length;
    if (!(counting === 1 && counting + excluded === list.length)) {
      for (const item of list) bad.add(item.id);
    }
  }
  return [...bad];
}

export function availabilityLabel(placement: Placement, selected: boolean): string {
  if (!selected) return "Uitgesloten";
  if (placement.placeable) return "Gegevens beschikbaar";
  const text = placement.reasons.join(" ");
  if (/marktaandeel|concurrent|noemer|Bedragen/i.test(text)) return "Marktaandeel ontbreekt";
  if (/groei|groeigrens/i.test(text)) return "Marktgroei ontbreekt";
  if (/marktdefinitie|meetbasis|periode/i.test(text)) return "Afbakening open";
  return "Nog aanvullen";
}
