import { processLeadgenRunById, processNextQueuedLeadgenRun } from "@/lib/leadgen/pipeline";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  try {
    if (runId) {
      await processLeadgenRunById(runId);
      return Response.json({ ok: true, runId });
    }
    const processed = await processNextQueuedLeadgenRun();
    return Response.json({ ok: true, processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Leadgen worker mislukt";
    return Response.json({ error: message }, { status: 500 });
  }
}
