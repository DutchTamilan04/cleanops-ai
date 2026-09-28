import { createSupabaseEventAdapterRepository } from "@/integrations/events/supabase-event-adapter";
import { getEventAdapterConfig, handleIntegrationEventPost } from "@/services/integration-event-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const config = getEventAdapterConfig();
    if (!config.enabled) return new Response("Not found", { status: 404 });
    return handleIntegrationEventPost(request, createSupabaseEventAdapterRepository, config);
  } catch {
    return Response.json({ error: "event_adapter_not_configured" }, { status: 503 });
  }
}
