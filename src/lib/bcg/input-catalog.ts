import type { BcgRefType } from "@/lib/bcg/constants";
import { FIVE_C_META, type FiveCKey } from "@/lib/marketing-5c/constants";
import { PESTEL_DIMENSION_META, type PestelDimension } from "@/lib/pestel/constants";
import { PORTER_FORCE_META, type PorterForceKey } from "@/lib/porter/constants";
import { SWOT_QUADRANT_META, type SwotQuadrant } from "@/lib/swot/constants";
import { VRIO_OUTCOME_META, type VrioOutcome } from "@/lib/vrio/constants";
import type { BcgInputs } from "@/lib/bcg/types";

export type BcgCatalogEntry = {
  key: string;
  ref_type: BcgRefType;
  ref_id: string | null;
  label: string;
  text: string;
  group: "five_c" | "porter" | "pestel" | "swot" | "vrio" | "dossier";
};

export function catalogKey(refType: BcgRefType, refId: string | null): string {
  return `${refType}:${refId ?? ""}`;
}

/**
 * Bronnen voor markt en aanbod. Een SWOT-sterkte, een VRIO-uitkomst of de omzet
 * van de klant is geen marktgroei en geen marktaandeel.
 */
export function buildBcgCatalog(inputs: BcgInputs): BcgCatalogEntry[] {
  const entries: BcgCatalogEntry[] = [];
  const tenant = inputs.tenant;
  entries.push({
    key: catalogKey("tenant_profile", tenant.id),
    ref_type: "tenant_profile",
    ref_id: tenant.id,
    label: `Klantprofiel · ${tenant.name}`,
    text: [tenant.name, tenant.website, tenant.audit_goal].filter(Boolean).join("\n"),
    group: "dossier",
  });

  for (const item of inputs.five_c_items) {
    entries.push({
      key: catalogKey("five_c_item", item.id),
      ref_type: "five_c_item",
      ref_id: item.id,
      label: `5C ${FIVE_C_META[item.c_key as FiveCKey]?.label ?? item.c_key} · ${item.title}`,
      text: [item.finding, item.client_relevance].filter(Boolean).join("\n"),
      group: "five_c",
    });
  }
  if (inputs.five_c_synthesis?.trim()) {
    entries.push({
      key: catalogKey("five_c_synthesis", null),
      ref_type: "five_c_synthesis",
      ref_id: null,
      label: "5C · strategische samenhang",
      text: inputs.five_c_synthesis,
      group: "five_c",
    });
  }

  const scope = inputs.porter_scope;
  if (scope) {
    const names = scope.known_competitors.map((c) => c.name).filter(Boolean).join(", ");
    entries.push({
      key: catalogKey("porter_scope", scope.id),
      ref_type: "porter_scope",
      ref_id: scope.id,
      label: `Porter · ${scope.market_sector || "markt"}`,
      text: [
        scope.market_sector,
        names ? `Bekende concurrenten (geen bewijs van de grootste op de gekozen meetbasis): ${names}` : "",
        scope.synthesis_text,
      ]
        .filter(Boolean)
        .join("\n"),
      group: "porter",
    });
  }
  for (const force of inputs.porter_forces) {
    entries.push({
      key: catalogKey("porter_force", force.id),
      ref_type: "porter_force",
      ref_id: force.id,
      label: `Porter ${PORTER_FORCE_META[force.force_key as PorterForceKey]?.label ?? force.force_key}`,
      text: [force.headline_factor, force.motivation].filter(Boolean).join("\n"),
      group: "porter",
    });
  }

  for (const insight of inputs.pestel_insights) {
    entries.push({
      key: catalogKey("pestel_insight", insight.id),
      ref_type: "pestel_insight",
      ref_id: insight.id,
      label: `PESTEL ${PESTEL_DIMENSION_META[insight.dimension as PestelDimension]?.label ?? insight.dimension} · ${insight.title}`,
      text: insight.observation,
      group: "pestel",
    });
  }

  for (const item of inputs.swot_items) {
    entries.push({
      key: catalogKey("swot_item", item.id),
      ref_type: "swot_item",
      ref_id: item.id,
      label: `SWOT ${SWOT_QUADRANT_META[item.quadrant as SwotQuadrant]?.label ?? item.quadrant}`,
      text: `${item.statement}\nEen sterkte of zwakte bewijst geen marktaandeel en geen marktgroei.`,
      group: "swot",
    });
  }

  for (const resource of inputs.vrio_resources) {
    const outcome = VRIO_OUTCOME_META[resource.outcome as VrioOutcome]?.label ?? resource.outcome;
    entries.push({
      key: catalogKey("vrio_resource", resource.id),
      ref_type: "vrio_resource",
      ref_id: resource.id,
      label: `VRIO · ${resource.title}`,
      text: `${resource.description}\nUitkomst: ${outcome}. Dit zegt niets over marktaandeel, marktgroei of winst.`,
      group: "vrio",
    });
  }

  for (const meeting of inputs.meetings) {
    entries.push({
      key: catalogKey("meeting", meeting.id),
      ref_type: "meeting",
      ref_id: meeting.id,
      label: `Meeting · ${meeting.title}`,
      text: meeting.text,
      group: "dossier",
    });
  }
  for (const doc of inputs.documents) {
    entries.push({
      key: catalogKey("pestel_input", doc.id),
      ref_type: "pestel_input",
      ref_id: doc.id,
      label: doc.label || "Document",
      text: doc.excerpt,
      group: "dossier",
    });
  }
  return entries;
}

export function offeringCandidates(inputs: BcgInputs): BcgInputs["five_c_items"] {
  return inputs.five_c_items.filter((item) => item.c_key === "company" && item.title.trim());
}
