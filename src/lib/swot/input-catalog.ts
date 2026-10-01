import type { SwotRefType } from "@/lib/swot/constants";
import type { SwotInputs } from "@/lib/swot/types";
import { PESTEL_DIMENSION_META, type PestelDimension } from "@/lib/pestel/constants";
import { PORTER_FORCE_META, type PorterForceKey } from "@/lib/porter/constants";
import { FIVE_C_META, type FiveCKey } from "@/lib/marketing-5c/constants";

export type SwotCatalogEntry = {
  key: string;
  ref_type: SwotRefType;
  ref_id: string | null;
  label: string;
  text: string;
  group: "dossier" | "pestel" | "porter" | "five_c";
};

export function catalogKey(refType: SwotRefType, refId: string | null): string {
  return `${refType}:${refId ?? ""}`;
}

export function buildSwotCatalog(inputs: SwotInputs): SwotCatalogEntry[] {
  const entries: SwotCatalogEntry[] = [];
  const t = inputs.tenant;

  entries.push({
    key: catalogKey("tenant_profile", t.id),
    ref_type: "tenant_profile",
    ref_id: t.id,
    label: `Klantprofiel · ${t.name}`,
    text: [t.name, t.website, t.audit_goal].filter(Boolean).join("\n"),
    group: "dossier",
  });

  for (const m of inputs.meetings) {
    if (!m.text.trim()) continue;
    entries.push({
      key: catalogKey("meeting", m.id),
      ref_type: "meeting",
      ref_id: m.id,
      label: `Meeting · ${m.title}`,
      text: m.text,
      group: "dossier",
    });
  }

  for (const ins of inputs.pestel_insights) {
    const dim = PESTEL_DIMENSION_META[ins.dimension as PestelDimension]?.label ?? ins.dimension;
    entries.push({
      key: catalogKey("pestel_insight", ins.id),
      ref_type: "pestel_insight",
      ref_id: ins.id,
      label: `PESTEL ${dim} · ${ins.title}`,
      text: [ins.observation, ins.client_relevance].filter(Boolean).join("\n"),
      group: "pestel",
    });
  }

  const ps = inputs.porter_scope;
  if (ps) {
    entries.push({
      key: catalogKey("porter_scope", ps.id),
      ref_type: "porter_scope",
      ref_id: ps.id,
      label: "Porter · synthese",
      text: [ps.market_sector, ps.synthesis_text].filter(Boolean).join("\n"),
      group: "porter",
    });
  }

  for (const f of inputs.porter_forces) {
    const fl = PORTER_FORCE_META[f.force_key as PorterForceKey]?.shortLabel ?? f.force_key;
    const text = [f.headline_factor, f.motivation, f.client_relevance].filter(Boolean).join("\n");
    if (!text.trim()) continue;
    entries.push({
      key: catalogKey("porter_force", f.id),
      ref_type: "porter_force",
      ref_id: f.id,
      label: `Porter ${fl}`,
      text,
      group: "porter",
    });
  }

  for (const fi of inputs.five_c_items) {
    entries.push({
      key: catalogKey("five_c_item", fi.id),
      ref_type: "five_c_item",
      ref_id: fi.id,
      label: `5C ${FIVE_C_META[fi.c_key as FiveCKey]?.label ?? fi.c_key} · ${fi.title}`,
      text: [fi.finding, fi.client_relevance].filter(Boolean).join("\n"),
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

  return entries;
}
