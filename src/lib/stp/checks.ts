import type { StpSegment, StpWorkbench } from "@/lib/stp/types";

export type StpLevel = "ready" | "attention" | "block";

export type StpCheck = {
  id: string;
  label: string;
  level: StpLevel;
  detail: string;
};

export function activeSegments(segments: StpSegment[]): StpSegment[] {
  return segments.filter((segment) => !segment.archived_at);
}

export function segmentSignals(segment: StpSegment, all: StpSegment[]): string[] {
  const notes: string[] = [];
  const peers = activeSegments(all).filter((item) => item.id !== segment.id);
  const name = segment.name.trim().toLowerCase();
  if (name && peers.some((item) => {
    const other = item.name.trim().toLowerCase();
    return other && (other === name || other.includes(name) || name.includes(other));
  })) {
    notes.push("Deze naam ligt dicht bij een ander segment.");
  }
  if (segment.need.trim().length < 8 && !segment.hypothesis) notes.push("Er is nog geen herkenbare behoefte.");
  if (segment.refs.length === 0 && segment.assumptions.trim().length < 8) notes.push("Nog zonder bron of aanname.");
  if (segment.description.trim().length > 500) notes.push("Dit segment is breed. Overweeg te splitsen.");
  if (segment.overlap_note.trim()) notes.push(segment.overlap_note.trim());
  return notes;
}

/** Blokkeert alleen wat de goedkeuring ook blokkeert. Onbekend is een aandachtspunt. */
export function stpChecks(wb: StpWorkbench): StpCheck[] {
  const version = wb.version;
  const active = activeSegments(wb.segments);
  const primary = active.filter((segment) => segment.disposition === "primary");
  const must = wb.criteria.filter((item) => item.kind === "must" && item.body.trim().length >= 3);
  const checks: StpCheck[] = [];

  checks.push(primary.length === 1
    ? { id: "primary", label: "Eén primaire doelgroep", level: "ready", detail: primary[0]?.name ?? "" }
    : { id: "primary", label: "Eén primaire doelgroep", level: "block", detail: "Kies precies één segment als eerste doelgroep." });

  checks.push(version.offering.trim().length >= 2
    ? { id: "offer", label: "Aanbod gekoppeld", level: "ready", detail: version.offering }
    : { id: "offer", label: "Aanbod gekoppeld", level: "block", detail: "Bevestig welk aanbod bij dit ICP hoort." });

  const need = primary[0]?.need.trim() ?? "";
  checks.push(need.length >= 8
    ? { id: "need", label: "Behoefte concreet", level: "ready", detail: need }
    : { id: "need", label: "Behoefte concreet", level: "block", detail: "De gekozen doelgroep heeft nog geen concrete behoefte." });

  checks.push(must.length > 0
    ? { id: "must", label: "Selectiecriteria", level: "ready", detail: `${must.length} criterium dat aanwezig moet zijn.` }
    : { id: "must", label: "Selectiecriteria", level: "block", detail: "Voeg minstens één observeerbaar criterium toe." });

  const excluded = active.filter((segment) => segment.disposition === "excluded");
  checks.push({
    id: "exclude",
    label: "Uitsluiting bekeken",
    level: excluded.length > 0 || active.length === 1 ? "ready" : "attention",
    detail: excluded.length > 0 ? `${excluded.length} segment uitgesloten.` : "Er is nog geen uitgesloten segment. Dat mag, als je dat bewust laat.",
  });

  checks.push(version.position_confirmed
    ? { id: "position", label: "Positionering bevestigd", level: "ready", detail: version.position_sentence || version.promise }
    : { id: "position", label: "Positionering bevestigd", level: "block", detail: "Bevestig de positionering voor je het ICP goedkeurt." });

  checks.push(version.claim_status === "conflict"
    ? { id: "claim", label: "Claims", level: version.accepted_uncertainty.trim().length >= 10 ? "attention" : "block", detail: "Er is tegenstrijdige informatie." }
    : { id: "claim", label: "Claims", level: version.claim_status === "supported" ? "ready" : "attention", detail: version.claim_status === "supported" ? "Onderbouwd." : "Een deel blijft hypothese of zonder bewijs." });

  checks.push(version.needs_review
    ? { id: "sources", label: "Bronversies", level: version.accepted_uncertainty.trim().length >= 10 ? "attention" : "block", detail: version.review_note || "Een eerdere analyse is gewijzigd." }
    : { id: "sources", label: "Bronversies", level: "ready", detail: "Geen nieuwere goedgekeurde analyse sinds de laatste keuze." });

  if (!version.icp_budget.trim()) {
    checks.push({ id: "budget", label: "Budget", level: "attention", detail: "Budget is onbekend en blijft onbekend." });
  }
  return checks;
}

export function approvalBlocked(checks: StpCheck[]): boolean {
  return checks.some((check) => check.level === "block");
}
