import { searchPublicWeb } from "@/lib/leadgen/web-search";
import type { SbExecutionContext } from "@/lib/salesbrain/engine/context";

export type JobSignalArtifact = {
  companyName: string;
  roleTitle: string;
  url: string;
  snippet: string;
  adStatus: "active" | "expired" | "unknown";
  firstSeenAt: string | null;
  checkedAt: string;
  sourceQuery: string;
};

export async function runJobAdsNode(
  ctx: SbExecutionContext,
  config: { maxResults?: number },
): Promise<JobSignalArtifact[]> {
  const max = Math.min(config.maxResults ?? 25, 30);
  const query = `site:linkedin.com/jobs OR "vacature" marketeer ${ctx.pinned.locationLabel} ${ctx.pinned.goalText}`;
  const hits = await searchPublicWeb(query, max);
  return hits.map((h) => {
    const title = h.title.split("|")[0]?.trim() || h.title.slice(0, 120);
    return {
      companyName: title.split("-")[0]?.trim() || title,
      roleTitle: title,
      url: h.url,
      snippet: h.snippet,
      adStatus: "unknown" as const,
      firstSeenAt: null,
      checkedAt: new Date().toISOString(),
      sourceQuery: query,
    };
  });
}
