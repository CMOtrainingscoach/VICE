import { processLeadgenRunById } from "@/lib/leadgen/pipeline";

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Run the leadgen pipeline for one run (cron route or direct fallback). */
export async function runLeadgenWorkerForRun(runId: string): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    try {
      const response = await fetch(
        `${appBaseUrl()}/api/cron/leadgen?runId=${encodeURIComponent(runId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
        },
      );
      if (response.ok) return;
    } catch {
      // fall through to direct worker (local dev, misconfigured URL, etc.)
    }
  }
  await processLeadgenRunById(runId);
}
