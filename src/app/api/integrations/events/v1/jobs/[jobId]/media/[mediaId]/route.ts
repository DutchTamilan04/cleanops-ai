import { createSupabaseAdapterMediaRepository } from "@/integrations/events/supabase-adapter-media";
import { getEventAdapterConfig } from "@/services/integration-event-adapter";
import { handleAdapterMediaPost } from "@/services/integration-event-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string; mediaId: string }> },
) {
  try {
    const config = getEventAdapterConfig();
    if (!config.enabled) return new Response("Not found", { status: 404 });
    const { jobId, mediaId } = await context.params;
    return handleAdapterMediaPost(request, jobId, mediaId, createSupabaseAdapterMediaRepository, config);
  } catch {
    return Response.json({ error: "event_adapter_not_configured" }, { status: 503 });
  }
}
