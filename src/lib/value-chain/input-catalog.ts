import { FIVE_C_META, type FiveCKey } from "@/lib/marketing-5c/constants";
import { PESTEL_DIMENSION_META, type PestelDimension } from "@/lib/pestel/constants";
import { PORTER_FORCE_META, type PorterForceKey } from "@/lib/porter/constants";
import { SWOT_QUADRANT_META, type SwotQuadrant } from "@/lib/swot/constants";
import type { VcRefType } from "@/lib/value-chain/constants";
import type { VcInputs } from "@/lib/value-chain/types";

export type VcCatalogEntry = {
  key: string;
  ref_type: VcRefType;
  ref_id: string | null;
  label: string;
  text: string;
  group: "five_c" | "swot" | "vrio" | "porter" | "pestel" | "dossier";
  /** Rechtstreeks uit een eerdere analyse, geen afgeleide kost of marge. */
  direct: boolean;
};

export function catalogKey(refType: VcRefType, refId: string | null): string {
  return `${refType}:${refId ?? ""}`;
}

export function buildVcCatalog(inputs: VcInputs): VcCatalogEntry[] {
  const entries: VcCatalogEntry[] = [];
  const t = inputs.tenant;
  entries.push({
    key: catalogKey("tenant_profile", t.id),
    ref_type: "tenant_profile",
    ref_id: t.id,
    label: `Klantdossier · ${t.name}`,
    text: [t.name, t.website, t.audit_goal].filter(Boolean).join("\n"),
    group: "dossier",
    direct: true,
  });

  for (const si of inputs.swot_items) {
    const q = SWOT_QUADRANT_META[si.quadrant as SwotQuadrant]?.label ?? si.quadrant;
    entries.push({
      key: catalogKey("swot_item", si.id),
      ref_type: "swot_item",
      ref_id: si.id,
      label: `SWOT ${q} · ${si.statement.slice(0, 80)}`,
      text: si.statement,
      group: "swot",
      direct: true,
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
      direct: true,
    });
  }

  if (inputs.five_c_synthesis?.trim()) {
    entries.push({
      key: catalogKey("five_c_synthesis", null),
      ref_type: "five_c_synthesis",
      ref_id: null,
      label: "5C · samenhang",
      text: inputs.five_c_synthesis,
      group: "five_c",
      direct: true,
    });
  }

  for (const r of inputs.vrio_resources) {
    entries.push({
      key: catalogKey("vrio_resource", r.id),
      ref_type: "vrio_resource",
      ref_id: r.id,
      label: `VRIO · ${r.title}`,
      text: `${r.title}\n${r.description}\nUitkomst: ${r.outcome}. Dit zegt niets over kosten of marge.`,
      group: "vrio",
      direct: true,
    });
  }

  if (inputs.porter_scope) {
    entries.push({
      key: catalogKey("porter_scope", inputs.porter_scope.id),
      ref_type: "porter_scope",
      ref_id: inputs.porter_scope.id,
      label: "Porter · afbakening",
      text: [inputs.porter_scope.market_sector, inputs.porter_scope.synthesis_text].filter(Boolean).join("\n"),
      group: "porter",
      direct: true,
    });
  }

  for (const f of inputs.porter_forces) {
    const meta = PORTER_FORCE_META[f.force_key as PorterForceKey];
    entries.push({
      key: catalogKey("porter_force", f.id),
      ref_type: "porter_force",
      ref_id: f.id,
      label: `Porter ${meta?.label ?? f.force_key}`,
      text: [f.headline_factor, f.motivation].filter(Boolean).join("\n"),
      group: "porter",
      direct: true,
    });
  }

  for (const i of inputs.pestel_insights) {
    const meta = PESTEL_DIMENSION_META[i.dimension as PestelDimension];
    entries.push({
      key: catalogKey("pestel_insight", i.id),
      ref_type: "pestel_insight",
      ref_id: i.id,
      label: `PESTEL ${meta?.label ?? i.dimension} · ${i.title}`,
      text: i.observation,
      group: "pestel",
      direct: true,
    });
  }

  for (const m of inputs.meetings) {
    entries.push({
      key: catalogKey("meeting", m.id),
      ref_type: "meeting",
      ref_id: m.id,
      label: `Meeting · ${m.title}`,
      text: m.text,
      group: "dossier",
      direct: true,
    });
  }

  for (const d of inputs.documents) {
    entries.push({
      key: catalogKey("pestel_input", d.id),
      ref_type: "pestel_input",
      ref_id: d.id,
      label: d.label || "Document",
      text: d.excerpt,
      group: "dossier",
      direct: true,
    });
  }

  return entries;
}
