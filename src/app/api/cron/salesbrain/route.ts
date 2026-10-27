import { processSalesbrainRunById } from "@/lib/salesbrain/engine/executor";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    return Response.json({ error: "runId required" }, { status: 400 });
  }

  try {
    await processSalesbrainRunById(runId);
    return Response.json({ ok: true, runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Salesbrain worker mislukt";
    return Response.json({ error: message }, { status: 500 });
  }
}
