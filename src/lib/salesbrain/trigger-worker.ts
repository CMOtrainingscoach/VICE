import { processSalesbrainRunById } from "@/lib/salesbrain/engine/executor";

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export async function runSalesbrainWorkerForRun(runId: string): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    try {
      const response = await fetch(
        `${appBaseUrl()}/api/cron/salesbrain?runId=${encodeURIComponent(runId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
        },
      );
      if (response.ok) return;
    } catch {
      /* direct fallback */
    }
  }
  await processSalesbrainRunById(runId);
}
