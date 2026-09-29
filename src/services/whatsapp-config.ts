import "server-only";
import { z } from "zod";

const schema = z.object({
  WHATSAPP_CLOUD_ENABLED: z.enum(["true", "false"]).default("false"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(24),
  WHATSAPP_APP_SECRET: z.string().min(24),
  WHATSAPP_ACCESS_TOKEN: z.string().min(24),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/),
  WHATSAPP_WORKER_TOKEN: z.string().min(24),
  WHATSAPP_WORKER_ID: z.string().min(1).max(120).default("cleanops-whatsapp-worker"),
});

export function getWhatsAppConfig(environment: Record<string, string | undefined> = process.env) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error("WhatsApp Cloud API is not configured.");
  return {
    enabled: parsed.data.WHATSAPP_CLOUD_ENABLED === "true",
    verifyToken: parsed.data.WHATSAPP_VERIFY_TOKEN,
    appSecret: parsed.data.WHATSAPP_APP_SECRET,
    accessToken: parsed.data.WHATSAPP_ACCESS_TOKEN,
    graphVersion: parsed.data.WHATSAPP_GRAPH_VERSION,
    workerToken: parsed.data.WHATSAPP_WORKER_TOKEN,
    workerId: parsed.data.WHATSAPP_WORKER_ID,
  };
}

const inboundWorkerSchema = z.object({
  WHATSAPP_CLOUD_ENABLED: z.enum(["true", "false"]).default("false"),
  CLEANOPS_MAKE_WHATSAPP_ENABLED: z.enum(["true", "false"]).default("false"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().optional(),
  WHATSAPP_WORKER_ID: z.string().min(1).max(120).default("cleanops-whatsapp-worker"),
  CRON_SECRET: z.string().optional(),
  WHATSAPP_WORKER_TOKEN: z.string().optional(),
});

/** Inbound processing can serve the Make relay without enabling the raw Meta webhook. */
export function getWhatsAppInboundWorkerConfig(
  environment: Record<string, string | undefined> = process.env,
) {
  const parsed = inboundWorkerSchema.safeParse(environment);
  if (!parsed.success) throw new Error("WhatsApp inbound worker is not configured.");
  const values = parsed.data;
  const enabled = values.WHATSAPP_CLOUD_ENABLED === "true" ||
    values.CLEANOPS_MAKE_WHATSAPP_ENABLED === "true";
  if (enabled && (
    !values.WHATSAPP_ACCESS_TOKEN || values.WHATSAPP_ACCESS_TOKEN.length < 24 ||
    !values.WHATSAPP_GRAPH_VERSION || !/^v\d+\.\d+$/.test(values.WHATSAPP_GRAPH_VERSION)
  )) throw new Error("WhatsApp inbound worker is not configured.");
  return {
    enabled,
    accessToken: values.WHATSAPP_ACCESS_TOKEN ?? "",
    graphVersion: values.WHATSAPP_GRAPH_VERSION ?? "",
    workerId: values.WHATSAPP_WORKER_ID,
    authTokens: [values.CRON_SECRET ?? "", values.WHATSAPP_WORKER_TOKEN ?? ""]
      .filter((token) => token.length >= 32),
  };
}
