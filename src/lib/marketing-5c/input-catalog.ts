import {
  FIVE_C_ALLOWED_PORTER_FORCES,
  FIVE_C_ALLOWED_REF_TYPES,
  type FiveCKey,
  type FiveCRefType,
} from "@/lib/marketing-5c/constants";
import type { FiveCInputs, FiveCWorkbench } from "@/lib/marketing-5c/types";
import { PESTEL_DIMENSION_META, type PestelDimension } from "@/lib/pestel/constants";
import { PORTER_FORCE_META, type PorterForceKey } from "@/lib/porter/constants";

export type FiveCCatalogGroup = "dossier" | "pestel" | "porter";

export type FiveCCatalogEntry = {
  key: string;
  ref_type: FiveCRefType;
  ref_id: string;
  group: FiveCCatalogGroup;
  label: string;
  text: string;
  date: string | null;
  evidence_level: string | null;
  force_key: string | null;
};

export function catalogKey(refType: FiveCRefType, refId: string | null): string {
  return `${refType}:${refId ?? ""}`;
}

function forceLabel(forceKey: string): string {
  return PORTER_FORCE_META[forceKey as PorterForceKey]?.shortLabel ?? forceKey;
}

export function buildFiveCCatalog(inputs: FiveCInputs): FiveCCatalogEntry[] {
  const entries: FiveCCatalogEntry[] = [];

  const t = inputs.tenant;
  entries.push({
    key: catalogKey("tenant_profile", t.id),
    ref_type: "tenant_profile",
    ref_id: t.id,
    group: "dossier",
    label: `Klantprofiel ${t.name}`,
    text: [
      `Naam: ${t.name}`,
      t.website ? `Website: ${t.website}` : "",
      t.audit_goal ? `Auditdoel: ${t.audit_goal}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    date: null,
    evidence_level: "provided",
    force_key: null,
  });

  for (const m of inputs.meetings) {
    const text = [m.text, m.notes ? `Notities: ${m.notes}` : ""].filter(Boolean).join("\n").trim();
    if (!text) continue;
    entries.push({
      key: catalogKey("meeting", m.id),
      ref_type: "meeting",
      ref_id: m.id,
      group: "dossier",
      label: `Meeting · ${m.title}`,
      text,
      date: m.created_at,
      evidence_level: "provided",
      force_key: null,
    });
  }

  for (const inp of inputs.pestel_inputs) {
    const text = inp.excerpt.trim();
    if (!text) continue;
    entries.push({
      key: catalogKey("pestel_input", inp.id),
      ref_type: "pestel_input",
      ref_id: inp.id,
      group: "dossier",
      label: `${inp.kind === "document" ? "Document" : "Notitie"} · ${inp.label || "Zonder titel"}`,
      text,
      date: inp.created_at,
      evidence_level: "provided",
      force_key: null,
    });
  }

  for (const ins of inputs.pestel_insights) {
    const dim = PESTEL_DIMENSION_META[ins.dimension as PestelDimension]?.label ?? ins.dimension;
    entries.push({
      key: catalogKey("pestel_insight", ins.id),
      ref_type: "pestel_insight",
      ref_id: ins.id,
      group: "pestel",
      label: `PESTEL ${dim} · ${ins.title}`,
      text: [
        ins.observation,
        ins.client_relevance ? `Betekenis klant: ${ins.client_relevance}` : "",
        ins.insight_time_horizon ? `Horizon: ${ins.insight_time_horizon}` : "",
        inputs.pestel_scope?.geo_markets?.length ?
          `Regio: ${inputs.pestel_scope.geo_markets.join(", ")}`
        : "",
      ]
        .filter(Boolean)
        .join("\n"),
      date: null,
      evidence_level: ins.evidence_level,
      force_key: null,
    });
  }

  const ps = inputs.porter_scope;
  if (ps) {
    entries.push({
      key: catalogKey("porter_scope", ps.id),
      ref_type: "porter_scope",
      ref_id: ps.id,
      group: "porter",
      label: "Porter · marktafbakening en bekende concurrenten",
      text: [
        `Markt: ${ps.market_sector}`,
        `Aanbod: ${ps.offering_description}`,
        `Klantsegment: ${ps.client_segment}`,
        `Regio: ${ps.geo_markets.join(", ")}`,
        ps.known_competitors.length ?
          `Bekende concurrenten: ${ps.known_competitors.map((c) => (c.url ? `${c.name} (${c.url})` : c.name)).join("; ")}`
        : "",
      ]
        .filter(Boolean)
        .join("\n"),
      date: null,
      evidence_level: "provided",
      force_key: null,
    });
  }

  for (const f of inputs.porter_forces) {
    const text = [
      f.headline_factor,
      f.motivation,
      f.client_relevance ? `Betekenis klant: ${f.client_relevance}` : "",
      f.intensity !== "unknown" ? `Intensiteit: ${f.intensity}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) continue;
    entries.push({
      key: catalogKey("porter_force", f.id),
      ref_type: "porter_force",
      ref_id: f.id,
      group: "porter",
      label: `Porter ${forceLabel(f.force_key)}`,
      text,
      date: null,
      evidence_level: null,
      force_key: f.force_key,
    });
  }

  for (const pf of inputs.porter_factors) {
    entries.push({
      key: catalogKey("porter_factor", pf.id),
      ref_type: "porter_factor",
      ref_id: pf.id,
      group: "porter",
      label: `Porter ${forceLabel(pf.force_key)} · ${pf.title}`,
      text: pf.observation,
      date: null,
      evidence_level: pf.evidence_level,
      force_key: pf.force_key,
    });
  }

  return entries;
}

/** Adviseursinput (eigen bevindingen en beantwoorde hiaten) als bron voor herwerking. */
export function buildFiveCCatalogFromWorkbench(wb: FiveCWorkbench): FiveCCatalogEntry[] {
  const entries = buildFiveCCatalog(wb.inputs);
  for (const item of wb.items) {
    if (item.review_status === "rejected") continue;
    if (item.origin === "manual" && item.content_type !== "input_needed") {
      const text = [item.finding, item.client_relevance, item.advisor_note].filter(Boolean).join("\n").trim();
      if (text.length < 3) continue;
      entries.push({
        key: catalogKey("manual", item.id),
        ref_type: "manual",
        ref_id: item.id,
        group: "dossier",
        label: `Adviseur · ${item.title || "Eigen aanvulling"}`,
        text,
        date: item.created_at,
        evidence_level: item.evidence_level,
        force_key: null,
      });
    } else if (item.gap_status === "answered" && item.gap_answer.trim().length >= 3) {
      entries.push({
        key: catalogKey("manual", item.id),
        ref_type: "manual",
        ref_id: item.id,
        group: "dossier",
        label: `Antwoord adviseur · ${item.title}`,
        text: `${item.open_question}\nAntwoord: ${item.gap_answer}`,
        date: item.created_at,
        evidence_level: "provided",
        force_key: null,
      });
    }
  }
  return entries;
}

export function activeCatalog(
  entries: FiveCCatalogEntry[],
  excluded: readonly string[],
): FiveCCatalogEntry[] {
  const skip = new Set(excluded);
  return entries.filter((e) => !skip.has(e.key));
}

export function isEntryAllowedForC(entry: FiveCCatalogEntry, cKey: FiveCKey): boolean {
  if (!FIVE_C_ALLOWED_REF_TYPES[cKey].includes(entry.ref_type)) return false;
  if (entry.ref_type === "porter_force" || entry.ref_type === "porter_factor") {
    const forces = FIVE_C_ALLOWED_PORTER_FORCES[cKey];
    return Boolean(forces && entry.force_key && forces.includes(entry.force_key));
  }
  return true;
}

export function entriesForC(entries: FiveCCatalogEntry[], cKey: FiveCKey): FiveCCatalogEntry[] {
  return entries.filter((e) => isEntryAllowedForC(e, cKey));
}
