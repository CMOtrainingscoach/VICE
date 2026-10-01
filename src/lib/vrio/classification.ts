import {
  VRIO_CRITERIA,
  VRIO_OUTCOME_META,
  type VrioAnswer,
  type VrioCriterion,
  type VrioOutcome,
  type VrioPriorityAction,
} from "@/lib/vrio/constants";

export type VrioAnswers = Record<VrioCriterion, VrioAnswer>;

/**
 * Vaste applicatieregels (spiegel van app.vrio_outcome in de database).
 * 'Onbekend' en 'niet beoordeeld' zijn nooit gelijk aan 'Nee'.
 */
export function classifyVrio(answers: VrioAnswers): VrioOutcome {
  const { value, rarity, imitability, organization } = answers;

  if (value === "no") return "disadvantage";
  if (value !== "yes") return "undetermined";

  if (rarity === "no") return "parity";
  if (rarity !== "yes") return "undetermined";

  if (imitability === "no") return "temporary";
  if (imitability !== "yes") return "undetermined";

  if (organization === "no") return "unused_potential";
  if (organization === "yes") return "sustained";
  return "undetermined";
}

/** Welke criteria de uitkomst bepaalden, voor 'Waarom deze uitkomst?'. */
export function decisiveCriteria(answers: VrioAnswers): VrioCriterion[] {
  const outcome = classifyVrio(answers);
  switch (outcome) {
    case "disadvantage":
      return ["value"];
    case "parity":
      return ["value", "rarity"];
    case "temporary":
      return ["value", "rarity", "imitability"];
    case "unused_potential":
    case "sustained":
      return [...VRIO_CRITERIA];
    default:
      return [...VRIO_CRITERIA].filter((c) => answers[c] === "unknown" || answers[c] === "not_assessed");
  }
}

/** Criteria die nog nodig zijn voor een definitieve uitkomst (latere mogen vervallen). */
export function remainingCriteria(answers: VrioAnswers): VrioCriterion[] {
  if (classifyVrio(answers) !== "undetermined") return [];
  const order: VrioCriterion[] = ["value", "rarity", "imitability", "organization"];
  const missing: VrioCriterion[] = [];
  for (const c of order) {
    if (answers[c] === "yes") continue;
    missing.push(c);
    break;
  }
  return missing;
}

export function explainOutcome(answers: VrioAnswers): string {
  const outcome = classifyVrio(answers);
  if (outcome === "undetermined") {
    const missing = remainingCriteria(answers);
    return missing.length ?
        `Nog geen uitkomst: het antwoord op ${missing.map((c) => c.toUpperCase()).join(", ")} ontbreekt of is onbekend.`
      : VRIO_OUTCOME_META.undetermined.note;
  }
  return VRIO_OUTCOME_META[outcome].note;
}

/** Voorgestelde aandachtspunten; blijven bewerkbare voorstellen, geen beslissingen. */
export function suggestedAction(answers: VrioAnswers): VrioPriorityAction {
  switch (classifyVrio(answers)) {
    case "sustained":
      return "protect";
    case "unused_potential":
      return "organize";
    case "temporary":
      return "organize";
    case "parity":
      return "substantiate";
    case "disadvantage":
      return "reconsider";
    default:
      return "substantiate";
  }
}

/** Een conclusie blijft hypothetisch zolang het bewijs ontbreekt. */
export function isHypothetical(evidenceLevels: readonly string[]): boolean {
  if (evidenceLevels.length === 0) return true;
  return evidenceLevels.every((level) => level === "hypothesis");
}

export function emptyAnswers(): VrioAnswers {
  return {
    value: "not_assessed",
    rarity: "not_assessed",
    imitability: "not_assessed",
    organization: "not_assessed",
  };
}
