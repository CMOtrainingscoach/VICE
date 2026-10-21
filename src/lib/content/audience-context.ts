export type ContentAudienceContext = {
  icp: {
    headline: string;
    summary: string;
    offer: string;
    positioning: string;
  } | null;
  personas: {
    id?: string;
    displayName: string;
    roleTitle: string;
    summary: string;
    goals: string;
    pains: string;
    triggers: string;
    decisionCriteria: string;
    objections: string;
    infoNeeded?: string;
    approved: boolean;
  }[];
};

const TARGET_READER_RULES = [
  "Schrijf voor de lezer in deze functie/rol — niet over deze fictieve persona als persoon.",
  "Management vraagt andere diepgang, bewijslijn en taal dan operationele of specialistische rollen.",
  "Spreek de lezer direct aan waar passend; vermijd generieke B2B-praat die niet bij deze rol hoort.",
].join(" ");

export function formatAudiencePromptBlock(ctx: ContentAudienceContext | null | undefined): string {
  if (!ctx) return "";

  const persona = ctx.personas[0];
  if (persona?.roleTitle?.trim()) {
    return formatTargetPersonaBlock(ctx.icp, persona);
  }

  const parts: string[] = [];
  if (ctx.icp && (ctx.icp.headline || ctx.icp.summary)) {
    parts.push(
      [
        "ICP (organisatiecontext):",
        ctx.icp.headline,
        ctx.icp.summary,
        ctx.icp.offer ? `Aanbod: ${ctx.icp.offer}` : "",
        ctx.icp.positioning ? `Positionering: ${ctx.icp.positioning}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const personas = ctx.personas.filter((p) => p.approved || p.roleTitle.trim());
  if (personas.length) {
    parts.push(
      "Buyer persona's:",
      ...personas.slice(0, 4).map((p) => personaLines(p)),
    );
  }
  if (!parts.length) return "";
  return `${TARGET_READER_RULES}\n\n${parts.join("\n\n")}`;
}

function formatTargetPersonaBlock(
  icp: ContentAudienceContext["icp"],
  persona: ContentAudienceContext["personas"][0],
): string {
  const lines = [
    TARGET_READER_RULES,
    "",
    "Doelgroep voor deze tekst:",
    `- Rol/functie: ${persona.roleTitle}${persona.displayName ? ` (${persona.displayName})` : ""}`,
    persona.summary ? `- Context: ${persona.summary}` : "",
    persona.goals ? `- Wat ze willen bereiken: ${persona.goals}` : "",
    persona.pains ? `- Frustraties: ${persona.pains}` : "",
    persona.triggers ? `- Wanneer ze geïnteresseerd raken: ${persona.triggers}` : "",
    persona.decisionCriteria ? `- Waar ze op letten: ${persona.decisionCriteria}` : "",
    persona.objections ? `- Typische bezwaren: ${persona.objections}` : "",
    persona.infoNeeded ? `- Informatiebehoefte: ${persona.infoNeeded}` : "",
  ].filter(Boolean);

  if (icp && (icp.headline || icp.summary)) {
    lines.push(
      "",
      "Achterliggend ICP (bedrijfstype, geen andere lezer):",
      icp.headline,
      icp.summary,
    );
  }

  return lines.join("\n");
}

function personaLines(p: ContentAudienceContext["personas"][0]): string {
  return [
    `- ${p.displayName || p.roleTitle} (${p.roleTitle})${p.approved ? "" : " [concept]"}`,
    p.summary,
    p.goals ? `  Doelen: ${p.goals}` : "",
    p.pains ? `  Frustraties: ${p.pains}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
