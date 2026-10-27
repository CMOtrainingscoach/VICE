import { safeFetchUrl } from "@/lib/leadgen/safe-fetch";
import type { SearchHitArtifact } from "@/lib/salesbrain/engine/nodes/web-research";

export type PageEvidenceArtifact = {
  url: string;
  finalUrl: string;
  status: number;
  textExcerpt: string;
  retrievedAt: string;
  unreachable: boolean;
};

export async function runWebsiteFetchNode(hits: SearchHitArtifact[], limit = 12): Promise<PageEvidenceArtifact[]> {
  const out: PageEvidenceArtifact[] = [];
  for (const hit of hits.slice(0, limit)) {
    try {
      const fetched = await safeFetchUrl(hit.url);
      out.push({
        url: hit.url,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        textExcerpt: fetched.text.slice(0, 4000),
        retrievedAt: new Date().toISOString(),
        unreachable: fetched.status < 200 || fetched.status >= 400,
      });
    } catch {
      out.push({
        url: hit.url,
        finalUrl: hit.url,
        status: 0,
        textExcerpt: "",
        retrievedAt: new Date().toISOString(),
        unreachable: true,
      });
    }
  }
  return out;
}
