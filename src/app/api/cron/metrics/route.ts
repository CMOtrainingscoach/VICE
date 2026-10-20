import { runMetricsCronSync } from "@/modules/metrics/actions";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runMetricsCronSync();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron sync mislukt";
    return Response.json({ error: message }, { status: 500 });
  }
}
