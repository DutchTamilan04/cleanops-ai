import { after } from "next/server";
import { createSupabaseEventAdapterRepository } from "@/integrations/events/supabase-event-adapter";
import { getEventAdapterConfig, handleIntegrationEventPost } from "@/services/integration-event-adapter";
import { drainAdapterJobs } from "@/services/integration-event-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const config = getEventAdapterConfig();
    if (!config.enabled) return new Response("Not found", { status: 404 });
    const response = await handleIntegrationEventPost(request, createSupabaseEventAdapterRepository, config);
    if (response.status === 202) {
      // Best-effort immediate drain after durable 202; cron recovers jobs left
      // behind by a process crash or failed background callback.
      after(async () => {
        try {
          const result = await drainAdapterJobs(createSupabaseEventAdapterRepository(), 5);
          if (result.alertCodes.length) console.error("cleanops_adapter_queue_alert", JSON.stringify({
            alertCodes: result.alertCodes, health: result.health,
          }));
        } catch {
          console.error("cleanops_adapter_background_drain_unavailable");
        }
      });
    }
    return response;
  } catch {
    return Response.json({ error: "event_adapter_not_configured" }, { status: 503 });
  }
}
