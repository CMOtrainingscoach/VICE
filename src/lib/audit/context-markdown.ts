import { DIMENSION_LABELS, EVIDENCE_LABELS, JUDGEMENT_LABELS, MATERIAL_LABELS, PAGE_ROLE_LABELS, PRIORITY_KIND_LABELS } from "@/lib/brand/constants";
import type { BrandDimensionKey, BrandJudgement, EvidenceStatus, MaterialType, PageRole, PriorityKind } from "@/lib/brand/constants";
import type { BrandWorkbench } from "@/lib/brand/types";
import { BCG_QUADRANT_META } from "@/lib/bcg/constants";
import { readingFor } from "@/lib/bcg/reading";
import type { BcgWorkbench } from "@/lib/bcg/types";
import { FIVE_C_META } from "@/lib/marketing-5c/constants";
import type { FiveCKey } from "@/lib/marketing-5c/constants";
import type { FiveCWorkbench } from "@/lib/marketing-5c/types";
import { PESTEL_DIMENSION_META } from "@/lib/pestel/constants";
import type { PestelDimension } from "@/lib/pestel/constants";
import type { PestelWorkbench } from "@/lib/pestel/types";
import { PORTER_FORCE_META } from "@/lib/porter/constants";
import type { PorterForceKey } from "@/lib/porter/constants";
import type { PorterWorkbench } from "@/lib/porter/types";
import type { PersonaWorkbench } from "@/lib/persona/types";
import { SWOT_QUADRANT_META } from "@/lib/swot/constants";
import type { SwotQuadrant } from "@/lib/swot/constants";
import type { SwotWorkbench } from "@/lib/swot/types";
import type { StpWorkbench } from "@/lib/stp/types";
import type { VcWorkbench } from "@/lib/value-chain/types";
import { VRIO_OUTCOME_META } from "@/lib/vrio/constants";
import type { VrioOutcome } from "@/lib/vrio/constants";
import type { VrioWorkbench } from "@/lib/vrio/types";

export type FrameworkLoad<T> = { state: "missing" } | { state: "error"; error: string } | { state: "ready"; data: T };

export type AuditContextSource = {
  company: { name: string; website: string; auditGoal: string };
  savedAt: string;
  meetings: { title: string; text: string }[];
  documents: { label: string; excerpt: string }[];
  pestel: FrameworkLoad<PestelWorkbench>;
  porter: FrameworkLoad<PorterWorkbench>;
  fiveC: FrameworkLoad<FiveCWorkbench>;
  swot: FrameworkLoad<SwotWorkbench>;
  vrio: FrameworkLoad<VrioWorkbench>;
  bcg: FrameworkLoad<BcgWorkbench>;
  valueChain: FrameworkLoad<VcWorkbench>;
  stp: FrameworkLoad<StpWorkbench>;
  persona: FrameworkLoad<PersonaWorkbench>;
  brand: BrandWorkbench;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function bullet(label: string, value: string | null | undefined): string | null {
  const text = clean(value);
  return text ? `- ${label}: ${text}` : null;
}

function paragraph(label: string, value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? `**${label}.** ${text}` : null;
}

function hypothesis(flag: boolean): string {
  return flag ? " (hypothese)" : "";
}

function join(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join("\n");
}

function framework<T extends { version: { version_number: number; status: string } }>(
  title: string,
  load: FrameworkLoad<T>,
  body: (data: T) => string,
): string {
  if (load.state === "missing") return `## ${title}\n\nNog niet gestart. Er is niets opgeslagen.`;
  if (load.state === "error") return `## ${title}\n\nNiet meegenomen: ${load.error}`;
  const head = `## ${title}\n\nVersie ${load.data.version.version_number} · ${load.data.version.status}`;
  const text = body(load.data).trim();
  return text ? `${head}\n\n${text}` : `${head}\n\nNog geen bevindingen opgeslagen.`;
}

function named<T extends string>(meta: Record<string, { label: string }>, key: T | string): string {
  return meta[key]?.label ?? key;
}

export function buildAuditContextMarkdown(source: AuditContextSource): string {
  const company = source.company;
  const sections = [
    [
      `# Strategische audit — ${clean(company.name) || "Klant"}`,
      "",
      "Dit bestand is de opgeslagen context van de audit. Het bevat alleen tekst die in VICE is bewaard. Lege velden zijn weggelaten. Een hypothese is geen feit. Een website toont wat het merk zegt, niet wat de markt vindt. Ontbrekend onderzoek is geen slechte prestatie.",
      "",
      `Opgeslagen: ${source.savedAt}`,
      bullet("Website", company.website),
      bullet("Auditdoel", company.auditGoal),
    ].filter((line): line is string => line !== null).join("\n"),
    meetings(source),
    documents(source),
    pestel(source.pestel),
    porter(source.porter),
    fiveC(source.fiveC),
    swot(source.swot),
    vrio(source.vrio),
    bcg(source.bcg),
    valueChain(source.valueChain),
    stp(source.stp),
    persona(source.persona),
    brand(source.brand),
  ];
  return `${sections.filter((section) => section.trim()).join("\n\n")}\n`;
}

function meetings(source: AuditContextSource): string {
  if (source.meetings.length === 0) return "## Gesprekken\n\nGeen gesprektekst opgeslagen.";
  const blocks = source.meetings.map((meeting) => join([`### ${clean(meeting.title) || "Gesprek"}`, meeting.text.trim() || "Geen tekst opgeslagen."]));
  return `## Gesprekken\n\n${blocks.join("\n\n")}`;
}

function documents(source: AuditContextSource): string {
  if (source.documents.length === 0) return "## Documenten\n\nGeen documenttekst opgeslagen.";
  const blocks = source.documents.map((document) => join([`### ${clean(document.label) || "Document"}`, document.excerpt.trim() || "Geen tekst opgeslagen."]));
  return `## Documenten\n\n${blocks.join("\n\n")}`;
}

function pestel(load: FrameworkLoad<PestelWorkbench>): string {
  return framework("1. PESTEL", load, (data: PestelWorkbench) => {
    const version = data.version;
    const insights = data.insights.filter((insight) => insight.review_status !== "rejected");
    return join([
      bullet("Sector", version.market_sector),
      bullet("Markten", version.geo_markets.join(", ")),
      bullet("Horizon", version.time_horizon),
      bullet("Aanbod", version.services_offerings),
      bullet("Doelgroep van het aanbod", version.offering_audience),
      paragraph("Synthese", version.synthesis_text),
      ...insights.map((insight) => join([
        `### ${named(PESTEL_DIMENSION_META, insight.dimension as PestelDimension)} · ${clean(insight.title) || "Inzicht"}`,
        bullet("Status", insight.review_status),
        bullet("Bewijs", insight.evidence_level),
        paragraph("Observatie", insight.observation),
        paragraph("Relevantie", insight.client_relevance),
        paragraph("Kans of risico", insight.opportunity_risk),
        paragraph("Notitie", insight.advisor_note),
      ])),
    ]);
  });
}

function porter(load: FrameworkLoad<PorterWorkbench>): string {
  return framework("2. Porter", load, (data: PorterWorkbench) => join([
    bullet("Sector", data.version.market_sector),
    bullet("Aanbod", data.version.offering_description),
    bullet("Markten", data.version.geo_markets.join(", ")),
    bullet("Segment", data.version.client_segment),
    bullet("Bekende concurrenten", data.version.known_competitors.map((item) => item.name).filter(Boolean).join(", ")),
    paragraph("Synthese", data.version.synthesis_text),
    ...data.forces.map((force) => join([
      `### ${named(PORTER_FORCE_META, force.force_key as PorterForceKey)}`,
      bullet("Intensiteit", force.intensity),
      bullet("Hoofdfactor", force.headline_factor),
      paragraph("Motivatie", force.motivation),
      paragraph("Relevantie", force.client_relevance),
      paragraph("Notitie", force.advisor_note),
    ])),
  ]));
}

function fiveC(load: FrameworkLoad<FiveCWorkbench>): string {
  return framework("3. 5C", load, (data: FiveCWorkbench) => {
    const kept = data.items.filter((item) => item.review_status !== "rejected");
    return join([
      paragraph("Synthese", data.version.synthesis_text),
      ...data.sections.map((section) => paragraph(named(FIVE_C_META, section.c_key), section.summary)),
      ...kept.map((item) => join([
        `### ${named(FIVE_C_META, item.c_key as FiveCKey)} · ${clean(item.title) || "Bevinding"}`,
        bullet("Bewijs", item.evidence_level),
        paragraph("Bevinding", item.finding),
        paragraph("Relevantie", item.client_relevance),
        paragraph("Open vraag", item.open_question),
        paragraph("Ontbrekend", item.gap_reason),
      ])),
    ]);
  });
}

function swot(load: FrameworkLoad<SwotWorkbench>): string {
  return framework("4. SWOT", load, (data: SwotWorkbench) => join([
    paragraph("Aanpassing", data.version.adjustment_note),
    ...(["strength", "weakness", "opportunity", "threat"] as SwotQuadrant[]).map((quadrant) => {
      const items = data.items.filter((item) => item.quadrant === quadrant);
      if (items.length === 0) return null;
      return [`### ${SWOT_QUADRANT_META[quadrant].label}`, ...items.map((item) => `- ${clean(item.statement)}`)].join("\n");
    }),
  ]));
}

function vrio(load: FrameworkLoad<VrioWorkbench>): string {
  return framework("5. VRIO", load, (data: VrioWorkbench) => join([
    paragraph("Synthese", data.version.synthesis_text),
    ...data.resources.map((resource) => join([
      `### ${clean(resource.title) || "Middel"}${resource.selected ? "" : " (niet geselecteerd)"}`,
      bullet("Uitkomst", VRIO_OUTCOME_META[resource.outcome as VrioOutcome]?.label ?? resource.outcome),
      paragraph("Beschrijving", resource.description),
      resource.partner_owned ? bullet("Eigendom", "Bij een partner") : null,
      paragraph("Toegang", resource.access_note),
      ...resource.assessments.map((assessment) => bullet(assessment.criterion, `${assessment.answer} · ${clean(assessment.motivation)}`)),
    ])),
    ...data.version.priorities.map((priority) => bullet("Prioriteit", `${priority.action} ${priority.note}`.trim())),
  ]));
}

function bcg(load: FrameworkLoad<BcgWorkbench>): string {
  return framework("6. BCG", load, (data: BcgWorkbench) => join([
    bullet("Scope", data.version.scope_label),
    bullet("Markt", data.version.market_label),
    bullet("Geografie", data.version.geography),
    data.version.qualitative ? "- Kwalitatief: cijfers zijn niet hard genoeg voor een kwantitatieve matrix." : null,
    ...data.items.map((item) => {
      const reading = readingFor(item, data.version);
      return join([
        `### ${clean(item.title) || "Activiteit"}${item.selected ? "" : " (niet meegenomen)"}`,
        item.selected ? null : bullet("Reden", item.exclusion_reason),
        bullet("Markt", item.market_definition),
        bullet("Geografie", item.geography),
        bullet("Segment", item.segment),
        bullet("Periode", item.period_label),
        bullet("Groei", item.growth_percent),
        bullet("Groeibewijs", item.growth_evidence),
        bullet("Eigen aandeel", item.own_share ?? item.own_amount),
        bullet("Leider", [item.leader_name, item.leader_share ?? item.leader_amount].filter(Boolean).join(" · ")),
        bullet("Aandeelbewijs", item.share_evidence),
        reading.placeable && reading.previewQuadrant
          ? bullet("Classificatie", BCG_QUADRANT_META[reading.previewQuadrant].label)
          : paragraph("Classificatie", reading.explanation),
        paragraph("Conflict", item.figures_conflict),
        paragraph("Open vraag", item.open_question),
      ]);
    }),
  ]));
}

function valueChain(load: FrameworkLoad<VcWorkbench>): string {
  return framework("7. Waardeketen", load, (data: VcWorkbench) => join([
    paragraph("Synthese", data.version.synthesis_text),
    data.version.finance_deferred ? "- Financiën zijn uitgesteld. Ontbrekende cijfers zijn geen conclusie over de keten." : null,
    ...data.chains.flatMap((chain) => [
      `### ${clean(chain.offering) || "Keten"}`,
      bullet("Markt", chain.market),
      bullet("Doel", chain.goal),
      ...chain.activities.map((activity) => join([
        `#### ${clean(activity.name) || "Activiteit"}${activity.not_applicable ? " (niet van toepassing)" : ""}`,
        activity.not_applicable ? bullet("Reden", activity.na_reason) : null,
        paragraph("Waarde voor de klant", activity.customer_value),
        bullet("Uitvoering", activity.execution),
        paragraph("Knelpunt", activity.bottleneck_observation),
        paragraph("Open vraag", activity.open_question),
      ])),
    ]),
    ...data.actions.filter((action) => action.status !== "dismissed").map((action) => bullet("Actie", `${action.title}: ${action.problem}`)),
  ]));
}

function stp(load: FrameworkLoad<StpWorkbench>): string {
  return framework("8. STP", load, (data: StpWorkbench) => {
    const version = data.version;
    const segments = data.segments.filter((segment) => !segment.archived_at);
    return join([
      bullet("Aanbod", version.offering),
      bullet("Geografie", version.geography),
      paragraph("Positioneringszin", version.position_sentence),
      bullet("Claim", version.claim_status),
      bullet("ICP", version.icp_name),
      paragraph("ICP-samenvatting", version.icp_summary),
      bullet("ICP-sector", version.icp_sector),
      paragraph("Aanvaarde onzekerheid", version.accepted_uncertainty),
      ...segments.map((segment) => join([
        `### ${clean(segment.name) || "Segment"}${segment.id === version.primary_segment_id ? " (primair)" : ""}${hypothesis(segment.hypothesis)}`,
        bullet("Besluit", segment.disposition),
        paragraph("Beschrijving", segment.description),
        paragraph("Behoefte", segment.need),
        paragraph("Aannames", segment.assumptions),
        paragraph("Open vraag", segment.open_question),
        segment.exclusion_reason ? bullet("Uitgesloten", segment.exclusion_reason) : null,
      ])),
    ]);
  });
}

function persona(load: FrameworkLoad<PersonaWorkbench>): string {
  return framework("9. Persona's", load, (data: PersonaWorkbench) => join([
    data.icp.present ? bullet("ICP", data.icp.name) : "- Geen ICP gekoppeld.",
    paragraph("ICP-samenvatting", data.icp.summary),
    paragraph("Aanvaarde onzekerheid", data.version.accepted_uncertainty),
    ...data.personas.filter((person) => person.active).map((person) => join([
      `### ${clean(person.role_title) || "Rol"}${person.audience_rank === "primary" ? " (primair)" : ""}${hypothesis(person.hypothesis)}`,
      bullet("Bewijs", person.evidence_level),
      paragraph("Samenvatting", person.summary),
      paragraph("Doelen", person.goals),
      paragraph("Pijn", person.pains),
      paragraph("Bezwaren", person.objections),
      paragraph("Aannames", person.assumptions),
      paragraph("Open vraag", person.open_question),
    ])),
    ...data.journeys.filter((journey) => !journey.archived_at).map((journey) => join([
      `### Klantreis · ${clean(journey.title) || journey.kind}${hypothesis(journey.hypothesis)}`,
      ...journey.phases.filter((phase) => !phase.archived_at).map((phase) => join([
        `#### ${clean(phase.name) || "Fase"}${hypothesis(phase.hypothesis)}`,
        paragraph("Doel", phase.goal),
        paragraph("Acties", phase.actions),
        paragraph("Drempels", phase.barriers),
        paragraph("Aanname", phase.assumption),
      ])),
    ])),
  ]));
}

function brand(data: BrandWorkbench): string {
  const version = data.version;
  const dimensions = data.dimensions.filter((dimension) => dimension.model === version.model);
  return join([
    `## 10. Brand audit`,
    "",
    `Versie ${version.version_number} · ${version.status} · ${version.model === "aaker" ? "Aaker" : "Keller"}`,
    bullet("Website", version.website_url),
    bullet("Periode", version.period_label),
    bullet("Onderzoek", version.research_availability),
    paragraph("Scope", version.scope_note),
    paragraph("Conclusie", version.verdict),
    paragraph("Sterkste onderbouwde associaties", version.strongest),
    paragraph("Zwakste onderbouwde onderdelen", version.weakest),
    paragraph("Nog niet te beoordelen", version.unassessed),
    paragraph("Beoogde positionering", version.positioning_intended),
    paragraph("Onderbouwde marktperceptie", version.perception_observed),
    paragraph("Verschil", version.gap_summary),
    paragraph("Aanvaarde onzekerheid", version.accepted_uncertainty),
    paragraph("Open vragen", version.open_questions),
    ...data.sources.map((source) => join([
      `### Bron · ${clean(source.label) || "Bron"}`,
      bullet("Soort", MATERIAL_LABELS[source.material_type as MaterialType] ?? source.material_type),
      bullet("Kanaal", source.channel),
      bullet("URL", source.source_url),
      paragraph("Tekst", source.excerpt),
      paragraph("Notitie", source.note),
    ])),
    ...data.pages.filter((page) => page.included).map((page) => join([
      `### Pagina · ${PAGE_ROLE_LABELS[page.role as PageRole] ?? page.role}`,
      bullet("URL", page.url),
      paragraph("Gelezen tekst", page.excerpt),
    ])),
    ...data.findings.map((finding) => join([
      `### Bevinding · ${finding.lens}${hypothesis(finding.hypothesis)}`,
      paragraph("Observatie", finding.observation),
      paragraph("Betekenis", finding.meaning),
      paragraph("Voorstel", finding.proposal),
    ])),
    ...dimensions.map((dimension) => join([
      `### ${DIMENSION_LABELS[dimension.dimension_key as BrandDimensionKey] ?? dimension.dimension_key}`,
      bullet("Oordeel", dimension.judgement ? JUDGEMENT_LABELS[dimension.judgement as BrandJudgement] : ""),
      bullet("Bewijs", EVIDENCE_LABELS[dimension.evidence_status as EvidenceStatus] ?? dimension.evidence_status),
      paragraph("Beoogd", dimension.intended),
      paragraph("Waargenomen", dimension.observed),
      paragraph("Verschil", dimension.gap_note),
      paragraph("Beperking", dimension.limits_note),
      paragraph("Open vraag", dimension.open_question),
    ])),
    ...data.priorities.map((priority) => bullet(
      "Prioriteit",
      `${priority.title} (${PRIORITY_KIND_LABELS[priority.kind as PriorityKind] ?? priority.kind}): ${priority.action}`,
    )),
  ]);
}
