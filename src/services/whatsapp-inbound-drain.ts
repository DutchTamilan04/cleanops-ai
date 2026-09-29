import "server-only";
import { createSupabaseWhatsAppEvidenceDependencies } from "@/integrations/evidence/supabase-evidence";
import { createSupabaseWhatsAppRepository } from "@/integrations/whatsapp/supabase-whatsapp";
import { getWhatsAppInboundWorkerConfig } from "@/services/whatsapp-config";
import { WhatsAppMediaClient } from "@/services/whatsapp-media";
import { processNextWhatsAppIngressJob } from "@/services/whatsapp-worker";

/** Shared bounded inbound drain for the Make acknowledgment and cron recovery paths. */
export async function drainWhatsAppInboundJobs(
  config: ReturnType<typeof getWhatsAppInboundWorkerConfig>,
) {
  const ingress = createSupabaseWhatsAppRepository();
  const evidence = createSupabaseWhatsAppEvidenceDependencies();
  const media = new WhatsAppMediaClient(config.accessToken, config.graphVersion);
  const results: string[] = [];
  const started = Date.now();
  for (let index = 0; index < 5 && Date.now() - started < 20_000; index += 1) {
    const result = await processNextWhatsAppIngressJob(
      ingress, evidence.repository, evidence.storage, media,
      { workerId: config.workerId, leaseSeconds: 60 },
    );
    results.push(result.status);
    if (result.status === "idle") break;
  }
  return { processed: results.filter((status) => status !== "idle").length, results };
}
