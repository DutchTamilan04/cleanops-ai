import { createSupabaseEventAdapterRepository } from "@/integrations/events/supabase-event-adapter";
import { handleIntegrationWorker } from "@/services/integration-event-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function tokens() {
  return [process.env.CRON_SECRET ?? "", process.env.CLEANOPS_EVENT_WORKER_TOKEN ?? ""];
}

export async function GET(request: Request) {
  return handleIntegrationWorker(request, createSupabaseEventAdapterRepository, tokens(),
    process.env.CLEANOPS_EVENT_ADAPTER_ENABLED === "true");
}

export async function POST(request: Request) {
  return handleIntegrationWorker(request, createSupabaseEventAdapterRepository, tokens(),
    process.env.CLEANOPS_EVENT_ADAPTER_ENABLED === "true");
}
