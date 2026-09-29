import { after } from "next/server";
import { createSupabaseWhatsAppRepository } from "@/integrations/whatsapp/supabase-whatsapp";
import {
  getMakeWhatsAppIngressConfig,
  handleMakeWhatsAppPost,
} from "@/services/make-whatsapp-ingress";
import { getWhatsAppInboundWorkerConfig } from "@/services/whatsapp-config";
import { drainWhatsAppInboundJobs } from "@/services/whatsapp-inbound-drain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let config;
  try {
    config = getMakeWhatsAppIngressConfig();
  } catch {
    return Response.json({ error: "make_whatsapp_not_configured" }, { status: 503 });
  }

  if (!config.enabled) return new Response("Not found", { status: 404 });
  const repository = createSupabaseWhatsAppRepository();
  const response = await handleMakeWhatsAppPost(request, repository, repository, config);
  if (response.status === 202) {
    // Durable acceptance is already complete. Background failure leaves the job
    // available for the independent, authenticated cron recovery drain.
    after(async () => {
      try {
        const workerConfig = getWhatsAppInboundWorkerConfig();
        if (workerConfig.enabled) await drainWhatsAppInboundJobs(workerConfig);
      } catch {
        console.error("cleanops_whatsapp_background_drain_unavailable");
      }
    });
  }
  return response;
}
