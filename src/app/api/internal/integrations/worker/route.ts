import { createSupabaseEventAdapterRepository } from "@/integrations/events/supabase-event-adapter";
import { handleIntegrationWorker } from "@/services/integration-event-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function token() {
  return process.env.CLEANOPS_EVENT_WORKER_TOKEN ?? process.env.CRON_SECRET ?? "";
}

export async function GET(request: Request) {
  return handleIntegrationWorker(request, createSupabaseEventAdapterRepository, token());
}

export async function POST(request: Request) {
  return handleIntegrationWorker(request, createSupabaseEventAdapterRepository, token());
}
