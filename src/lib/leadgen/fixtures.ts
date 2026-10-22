import type {
  LeadgenProspectDetail,
  LeadgenProspectRow,
  LeadgenRunDetail,
  LeadgenRunSummary,
} from "@/lib/leadgen/types";

export const LEADGEN_FIXTURE_BANNER =
  "Demogegevens — geen live onderzoek. Zet LEADGEN_FIXTURES uit en pas migratie 36300 toe voor echte runs.";

export function leadgenFixturesEnabled(): boolean {
  return process.env.LEADGEN_FIXTURES === "true" || process.env.LEADGEN_FIXTURES === "1";
}

const FIXTURE_RUN_ID = "00000000-0000-4000-8000-000000000001";

export function fixtureRunSummaries(): LeadgenRunSummary[] {
  return [
    {
      id: FIXTURE_RUN_ID,
      name: "Verouderde websites · Turnhout · 25 km",
      locationLabel: "Turnhout, België",
      radiusKm: 25,
      status: "completed",
      resultCount: 4,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      completedAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];
}

export function fixtureRunDetail(runId: string): LeadgenRunDetail | null {
  if (runId !== FIXTURE_RUN_ID) return null;
  const summary = fixtureRunSummaries()[0];
  return {
    ...summary,
    isFixture: true,
    errorMessage: null,
    config: {
      locationLabel: "Turnhout, België",
      placeId: "fixture-turnhout",
      lat: 51.3225,
      lng: 4.9447,
      radiusKm: 25,
      assignmentText: "Zoek bedrijven binnen dit gebied met een mogelijk verouderde website.",
      criteria: {
        maxResults: 30,
        signals: ["Mobiele weergave", "Gebroken links", "Verouderde inhoud"],
      },
      sources: ["public_internet"],
      interpretation: {
        targetBusinesses: "KMO's met een publieke website",
        geographicBoundary: "25 km rond Turnhout",
        criteriaSummary: "Signalen van verouderde of problematische websites",
        enabledSources: "Openbaar internet",
        resultLimit: 30,
      },
    },
    progress: {
      phase: "done",
      message: "Demo-run voltooid",
      discovered: 12,
      assessed: 8,
      qualified: 4,
    },
  };
}

export function fixtureProspectRows(): LeadgenProspectRow[] {
  return [
    {
      id: "p1",
      runProspectId: "rp1",
      displayName: "Atelier Noord",
      websiteUrl: "https://example.com/atelier-noord",
      websiteHost: "example.com",
      municipality: "Turnhout",
      distanceKm: 4,
      geoEligible: true,
      geoVerified: true,
      email: "info@example.com",
      phone: null,
      contactPageUrl: "https://example.com/contact",
      contactStatus: "to_contact",
      sourceCount: 2,
      assessedAt: new Date().toISOString(),
    },
    {
      id: "p2",
      runProspectId: "rp2",
      displayName: "Studio Linde",
      websiteUrl: "https://example.com/studio-linde",
      websiteHost: "example.com",
      municipality: "Beerse",
      distanceKm: 9,
      geoEligible: true,
      geoVerified: true,
      email: null,
      phone: "+32 14 000 000",
      contactPageUrl: null,
      contactStatus: "contacted",
      sourceCount: 1,
      assessedAt: new Date().toISOString(),
    },
    {
      id: "p3",
      runProspectId: "rp3",
      displayName: "Interieur Molen",
      websiteUrl: "https://example.com/interieur-molen",
      websiteHost: "example.com",
      municipality: "Vosselaar",
      distanceKm: 7,
      geoEligible: true,
      geoVerified: true,
      email: "hello@example.com",
      phone: null,
      contactPageUrl: null,
      contactStatus: "unreachable",
      sourceCount: 2,
      assessedAt: new Date().toISOString(),
    },
    {
      id: "p4",
      runProspectId: "rp4",
      displayName: "Groenwerk Den",
      websiteUrl: null,
      websiteHost: null,
      municipality: "Oud-Turnhout",
      distanceKm: 6,
      geoEligible: true,
      geoVerified: false,
      email: null,
      phone: null,
      contactPageUrl: null,
      contactStatus: "not_applicable",
      sourceCount: 1,
      assessedAt: null,
    },
  ];
}

export function fixtureProspectDetail(prospectId: string): LeadgenProspectDetail | null {
  const row = fixtureProspectRows().find((p) => p.id === prospectId);
  if (!row) return null;
  return {
    ...row,
    establishmentAddress: `${row.municipality}, België`,
    assessmentSummary:
      "De homepage toont layoutproblemen op smalle viewports en minstens één interne link gaf een fout.",
    signals: [
      { label: "Mobiele weergave", kind: "observed", detail: "Tekst valt buiten mobiel scherm (viewport-meta aanwezig maar fixed-width blokken)." },
      { label: "Gebroken links", kind: "observed", detail: "2 interne links retourneerden HTTP 404." },
      { label: "Verouderde inhoud", kind: "interpretation", detail: "Blogberichten ouder dan 24 maanden; geen bewijs dat diensten nog actueel zijn." },
    ],
    limitations: ["Geen screenshot — alleen HTML-analyse.", "Contactpagina niet bereikbaar tijdens inspectie."],
    sources: [
      {
        id: "s1",
        title: "Zoekresultaat",
        url: "https://example.com/atelier-noord",
        kind: "web_search",
        excerpt: "Atelier Noord — interieuratelier in Turnhout",
        retrievedAt: new Date().toISOString(),
      },
    ],
    notes: [],
    statusHistory: [{ status: row.contactStatus, changedAt: new Date().toISOString(), authorLabel: "Demo" }],
    researchRunAt: new Date(Date.now() - 3600000).toISOString(),
  };
}
