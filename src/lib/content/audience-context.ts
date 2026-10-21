export type ContentAudienceContext = {
  icp: {
    headline: string;
    summary: string;
    offer: string;
    positioning: string;
  } | null;
  personas: {
    displayName: string;
    roleTitle: string;
    summary: string;
    goals: string;
    pains: string;
    triggers: string;
    decisionCriteria: string;
    objections: string;
    approved: boolean;
  }[];
};

export function formatAudiencePromptBlock(ctx: ContentAudienceContext | null | undefined): string {
  if (!ctx) return "";
  const parts: string[] = [];

  if (ctx.icp && (ctx.icp.headline || ctx.icp.summary)) {
    parts.push(
      [
        "ICP (ideale klantorganisatie):",
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
      "Buyer persona's (schrijf voor deze mensen — toon, argumenten, bezwaren):",
      ...personas.slice(0, 4).map((p) =>
        [
          `- ${p.displayName || p.roleTitle} (${p.roleTitle})${p.approved ? "" : " [concept]"}`,
          p.summary,
          p.goals ? `  Doelen: ${p.goals}` : "",
          p.pains ? `  Frustraties: ${p.pains}` : "",
          p.triggers ? `  Kooptrigger: ${p.triggers}` : "",
          p.objections ? `  Bezwaren: ${p.objections}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }

  if (!parts.length) return "";
  return parts.join("\n\n");
}
