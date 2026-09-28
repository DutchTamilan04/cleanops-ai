import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { integrationEventSchema, type IntegrationEvent } from "@/schemas/integration-event";
import type { AcceptedEnvelope } from "@/services/ingress-repository";

const MAX_BODY_BYTES = 64_000;
const CLOCK_SKEW_SECONDS = 300;
const keyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const keysSchema = z.record(keyIdSchema, z.string().min(32));

export type EventAdapterConfig = { enabled: boolean; keys: Record<string, string> };
export type EventAdapterRepository = {
  accept(input: {
    keyId: string; nonce: string; event: IntegrationEvent;
    payload: Record<string, unknown>; payloadSha256: string;
  }): Promise<AcceptedEnvelope>;
  status(keyId: string, jobId: string): Promise<{
    eventId: string; jobId: string; status: string; attemptCount: number;
    lastErrorCode: string | null; createdAt: string; completedAt: string | null;
  } | null>;
};

export function getEventAdapterConfig(
  environment: Record<string, string | undefined> = process.env,
): EventAdapterConfig {
  const enabled = environment.CLEANOPS_EVENT_ADAPTER_ENABLED === "true";
  if (!enabled) return { enabled: false, keys: {} };
  const parsed = keysSchema.safeParse(JSON.parse(environment.CLEANOPS_EVENT_ADAPTER_KEYS ?? "{}"));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw new Error("Event adapter is not configured.");
  }
  return { enabled, keys: parsed.data };
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signedRequest(request: Request, config: EventAdapterConfig, digest: string, now: number) {
  const keyId = request.headers.get("x-cleanops-key-id") ?? "";
  const timestamp = request.headers.get("x-cleanops-timestamp") ?? "";
  const nonce = request.headers.get("x-cleanops-nonce") ?? "";
  const signature = request.headers.get("x-cleanops-signature") ?? "";
  if (!keyIdSchema.safeParse(keyId).success || !nonceSchema.safeParse(nonce).success
      || !/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  if (Math.abs(now - Number(timestamp)) > CLOCK_SKEW_SECONDS) return null;
  const secret = config.keys[keyId];
  if (!secret) return null;
  const path = new URL(request.url).pathname;
  const signed = [request.method, path, keyId, timestamp, nonce, digest].join("\n");
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  return secureEqual(signature, expected) ? { keyId, nonce } : null;
}

function noStore(body: object, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function repositoryError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("adapter_replay_detected")) return noStore({ error: "replay_detected" }, 409);
  if (message.includes("adapter_message_identity_conflict")) return noStore({ error: "message_identity_conflict" }, 409);
  if (message.includes("adapter_credential_not_authorized") || message.includes("adapter_account_not_authorized")) {
    return noStore({ error: "adapter_scope_denied" }, 403);
  }
  return noStore({ error: "database_unavailable" }, 503);
}

export async function handleIntegrationEventPost(
  request: Request, repository: EventAdapterRepository | (() => EventAdapterRepository), config: EventAdapterConfig,
  now = Math.floor(Date.now() / 1000),
) {
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return noStore({ error: "json_required" }, 415);
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return noStore({ error: "payload_too_large" }, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) return noStore({ error: "payload_too_large" }, 413);
  const digest = createHash("sha256").update(body).digest("hex");
  const auth = signedRequest(request, config, digest, now);
  if (!auth) return noStore({ error: "invalid_adapter_signature" }, 401);

  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(body)); }
  catch { return noStore({ error: "invalid_json" }, 400); }
  const parsed = integrationEventSchema.safeParse(value);
  if (!parsed.success) return noStore({ error: "invalid_event" }, 422);
  const event = parsed.data;
  // Generic media needs a provider-specific authenticated downloader or a
  // scoped upload ticket. Refuse it until one is configured.
  if (event.media.length) return noStore({ error: "media_transport_not_configured" }, 422);

  const payload = {
    schemaVersion: 1 as const,
    providerEventId: null,
    accountExternalId: event.sourceAccountId,
    messages: [{
      externalMessageId: event.externalMessageId ?? event.externalEventId,
      externalThreadId: event.threadId ?? event.externalEventId,
      senderId: event.senderReference ?? `unknown:${createHash("sha256").update(event.externalEventId).digest("hex").slice(0, 32)}`,
      occurredAt: event.occurredAt,
      text: event.text,
      mediaRefs: [],
      schemaVersion: 1 as const,
    }],
  };
  const payloadSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  try {
    const adapter = typeof repository === "function" ? repository() : repository;
    const accepted = await adapter.accept({
      keyId: auth.keyId, nonce: auth.nonce, event, payload, payloadSha256,
    });
    return noStore({ accepted: true, ...accepted }, 202);
  } catch (error) { return repositoryError(error); }
}

export async function handleIntegrationEventStatus(
  request: Request, repository: EventAdapterRepository | (() => EventAdapterRepository), config: EventAdapterConfig,
  jobId: string, now = Math.floor(Date.now() / 1000),
) {
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!z.string().uuid().safeParse(jobId).success) return noStore({ error: "invalid_job_id" }, 400);
  const digest = createHash("sha256").update("").digest("hex");
  const auth = signedRequest(request, config, digest, now);
  if (!auth) return noStore({ error: "invalid_adapter_signature" }, 401);
  try {
    const adapter = typeof repository === "function" ? repository() : repository;
    const result = await adapter.status(auth.keyId, jobId);
    return result ? noStore(result, 200) : noStore({ error: "job_not_found" }, 404);
  } catch { return noStore({ error: "database_unavailable" }, 503); }
}
