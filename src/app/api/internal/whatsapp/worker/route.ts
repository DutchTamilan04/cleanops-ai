import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseWhatsAppEvidenceDependencies } from "@/integrations/evidence/supabase-evidence";
import { createSupabaseWhatsAppOutboxRepository } from "@/integrations/whatsapp/supabase-outbox";
import { createSupabaseWhatsAppRepository } from "@/integrations/whatsapp/supabase-whatsapp";
import { getWhatsAppConfig, getWhatsAppInboundWorkerConfig } from "@/services/whatsapp-config";
import { WhatsAppMediaClient } from "@/services/whatsapp-media";
import { processNextWhatsAppReply } from "@/services/whatsapp-outbox";
import { processNextWhatsAppIngressJob, processWhatsAppEvidenceRetry } from "@/services/whatsapp-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const commandSchema = z.object({ retryEvidenceId: z.uuid().optional() }).strict();

function authorized(request: Request, token: string) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cron recovery is inbound-only; it never claims or sends an outbox reply. */
export async function GET(request: Request) {
  let config;
  try { config = getWhatsAppInboundWorkerConfig(); } catch {
    return Response.json({ error: "whatsapp_not_configured" }, { status: 503 });
  }
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!config.authTokens.some((token) => authorized(request, token))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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
  return Response.json({ processed: results.filter((status) => status !== "idle").length, results },
    { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let config;
  try { config = getWhatsAppConfig(); } catch { return Response.json({ error: "whatsapp_not_configured" }, { status: 503 }); }
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!authorized(request, config.workerToken)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rawCommand = await request.text();
  if (rawCommand.length > 1_000) return Response.json({ error: "payload_too_large" }, { status: 413 });
  let commandValue: unknown = {};
  try { commandValue = rawCommand ? JSON.parse(rawCommand) : {}; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const command = commandSchema.safeParse(commandValue);
  if (!command.success) return Response.json({ error: "invalid_command" }, { status: 400 });

  const ingress = createSupabaseWhatsAppRepository();
  const evidence = createSupabaseWhatsAppEvidenceDependencies();
  const media = new WhatsAppMediaClient(config.accessToken, config.graphVersion);
  if (command.data.retryEvidenceId) {
    const retry = await processWhatsAppEvidenceRetry(
      evidence.repository,
      evidence.storage,
      media,
      command.data.retryEvidenceId,
    );
    return Response.json({ retry }, { headers: { "cache-control": "no-store" } });
  }
  const inbound = await processNextWhatsAppIngressJob(
    ingress,
    evidence.repository,
    evidence.storage,
    media,
    { workerId: config.workerId, leaseSeconds: 60 },
  );
  const outbound = await processNextWhatsAppReply(createSupabaseWhatsAppOutboxRepository(), {
    workerId: config.workerId,
    leaseSeconds: 60,
    accessToken: config.accessToken,
    graphVersion: config.graphVersion,
  });
  return Response.json({ inbound, outbound }, { headers: { "cache-control": "no-store" } });
}
