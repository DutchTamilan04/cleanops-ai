import { createSupabaseEventAdapterRepository } from "@/integrations/events/supabase-event-adapter";
import { getEventAdapterConfig, handleIntegrationEventStatus } from "@/services/integration-event-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const config = getEventAdapterConfig();
    if (!config.enabled) return new Response("Not found", { status: 404 });
    const { jobId } = await context.params;
    return handleIntegrationEventStatus(request, createSupabaseEventAdapterRepository, config, jobId);
  } catch {
    return Response.json({ error: "event_adapter_not_configured" }, { status: 503 });
  }
}
