import { searchPublicWeb } from "@/lib/leadgen/web-search";
import type { SbExecutionContext } from "@/lib/salesbrain/engine/context";

export type SearchHitArtifact = {
  title: string;
  url: string;
  snippet: string;
  query: string;
  retrievedAt: string;
};

export async function runWebResearchNode(
  ctx: SbExecutionContext,
  config: { maxResults?: number },
): Promise<SearchHitArtifact[]> {
  const max = Math.min(config.maxResults ?? 20, 25);
  const query = `${ctx.pinned.goalText} ${ctx.pinned.locationLabel} vacature OR bedrijf`;
  const hits = await searchPublicWeb(query, max);
  return hits.map((h) => ({
    title: h.title,
    url: h.url,
    snippet: h.snippet,
    query,
    retrievedAt: new Date().toISOString(),
  }));
}
