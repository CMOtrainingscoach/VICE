import type { SbClientFormSchema, SbWorkflowDefinition } from "@/lib/salesbrain/graph/types";

/** Default published workflow: eerste marketeer — groeisignalen (demo-ready). */
export function exampleFirstMarketerWorkflow(): SbWorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: [
      { id: "start", type: "start", label: "Klantinput", config: {}, position: { x: 340, y: 0 } },
      {
        id: "ctx",
        type: "client_context",
        label: "Klantcontext",
        config: { includeOffer: true, includeBrandSlice: true },
        position: { x: 340, y: 88 },
      },
      {
        id: "docs",
        type: "documents",
        label: "Documenten",
        config: { optional: true },
        position: { x: 580, y: 140 },
      },
      {
        id: "jobs",
        type: "job_ads",
        label: "Vacatures zoeken",
        config: {
          maxResults: 25,
          searchQuery: "Zoek bedrijven die een eerste marketeer aanwerven",
          period: "30d",
          verifyOriginalAd: true,
          onError: "stop_branch",
        },
        position: { x: 120, y: 140 },
      },
      {
        id: "web",
        type: "web_research",
        label: "Live webonderzoek",
        config: { maxResults: 20 },
        position: { x: 340, y: 140 },
      },
      { id: "fetch", type: "website_fetch", label: "Website ophalen", config: {}, position: { x: 500, y: 248 } },
      { id: "norm", type: "normalize", label: "Normaliseren", config: {}, position: { x: 200, y: 248 } },
      {
        id: "verify",
        type: "verify_evidence",
        label: "Controleer bewijs",
        config: {},
        position: { x: 340, y: 280 },
      },
      {
        id: "icp",
        type: "icp_filter",
        label: "Filter & match",
        config: { strictGeo: true },
        position: { x: 340, y: 380 },
      },
      { id: "ai", type: "ai_analysis", label: "AI-analyse", config: { bounded: true }, position: { x: 520, y: 320 } },
      {
        id: "out",
        type: "results",
        label: "Prospectielijst",
        config: { outputKind: "prospects" },
        position: { x: 340, y: 480 },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "ctx" },
      { id: "e2", source: "start", target: "docs" },
      { id: "e3", source: "ctx", target: "jobs" },
      { id: "e4", source: "ctx", target: "web" },
      { id: "e5", source: "web", target: "fetch" },
      { id: "e6", source: "jobs", target: "norm" },
      { id: "e6b", source: "web", target: "norm" },
      { id: "e7", source: "fetch", target: "verify" },
      { id: "e8", source: "norm", target: "verify" },
      { id: "e9", source: "verify", target: "icp" },
      { id: "e10", source: "ctx", target: "icp" },
      { id: "e11", source: "icp", target: "ai" },
      { id: "e12", source: "ai", target: "out" },
    ],
  };
}

export function exampleFirstMarketerFormSchema(): SbClientFormSchema {
  return {
    schemaVersion: 1,
    steps: [
      {
        id: "goal",
        visible: true,
        fields: [
          { key: "icpId", type: "icp", required: true, label: "Ideale klantprofiel" },
          { key: "goalText", type: "text", required: true, label: "Wat zoek je?" },
          { key: "locationLabel", type: "location", required: true, label: "Locatie" },
          { key: "radiusKm", type: "radius", required: true, label: "Straal (km)", bounds: { min: 5, max: 100 } },
        ],
      },
      {
        id: "sources",
        visible: true,
        fields: [
          { key: "documentIds", type: "documents", required: false, label: "Documenten" },
          { key: "enableWeb", type: "optional_sources", required: false, label: "Live webonderzoek" },
        ],
      },
      { id: "review", visible: true, fields: [] },
    ],
  };
}

export function exampleInsightsOnlyWorkflow(): SbWorkflowDefinition {
  return {
    schemaVersion: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      { id: "gsc", type: "gsc_source", label: "Search Console", config: {} },
      { id: "ga4", type: "ga4_source", label: "GA4", config: {} },
      { id: "ai", type: "ai_analysis", label: "Marktinterpretatie", config: { insightsOnly: true } },
      { id: "out", type: "results", label: "Marktinzichten", config: { outputKind: "insights" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "gsc" },
      { id: "e2", source: "start", target: "ga4" },
      { id: "e3", source: "gsc", target: "ai" },
      { id: "e4", source: "ga4", target: "ai" },
      { id: "e5", source: "ai", target: "out" },
    ],
  };
}
