import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  handleIntegrationEventPost, handleIntegrationEventStatus,
  type EventAdapterRepository,
} from "@/services/integration-event-adapter";

const keyId = "adapter_key_1";
const secret = "a-test-adapter-secret-with-at-least-32-characters";
const now = 1_791_000_000;
const config = { enabled: true, keys: { [keyId]: secret } };
const event = {
  schemaVersion: 1, source: "whatsapp", sourceAccountId: "site-number-1",
  externalEventId: "event-1", externalMessageId: "message-1",
  senderReference: "worker-1", occurredAt: "2026-09-28T09:00:00Z",
  text: "Fuel for the Hastings job tonight. Receipt to follow.",
};

function signed(method: "GET" | "POST", path: string, body = "", options: {
  nonce?: string; timestamp?: number; signer?: string;
} = {}) {
  const timestamp = String(options.timestamp ?? now);
  const nonce = options.nonce ?? "unique_nonce_123456";
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", options.signer ?? secret)
    .update([method, path, keyId, timestamp, nonce, digest].join("\n")).digest("hex");
  return new Request(`https://cleanops.example${path}`, {
    method, ...(method === "POST" ? { body } : {}),
    headers: {
      "content-type": "application/json",
      "x-cleanops-key-id": keyId,
      "x-cleanops-timestamp": timestamp,
      "x-cleanops-nonce": nonce,
      "x-cleanops-signature": signature,
    },
  });
}

class FakeRepository implements EventAdapterRepository {
  accepted: Parameters<EventAdapterRepository["accept"]>[0][] = [];
  nonces = new Set<string>();
  messages = new Map<string, { digest: string; eventId: string; jobId: string }>();

  async accept(input: Parameters<EventAdapterRepository["accept"]>[0]) {
    if (this.nonces.has(input.nonce)) throw new Error("adapter_replay_detected");
    this.nonces.add(input.nonce);
    this.accepted.push(input);
    const id = input.event.externalMessageId ?? input.event.externalEventId;
    const existing = this.messages.get(id);
    if (existing) {
      if (existing.digest !== input.payloadSha256) throw new Error("adapter_message_identity_conflict");
      return { eventId: existing.eventId, jobId: existing.jobId, duplicate: true };
    }
    const result = { digest: input.payloadSha256, eventId: "event-id", jobId: "job-id" };
    this.messages.set(id, result);
    return { eventId: result.eventId, jobId: result.jobId, duplicate: false };
  }

  async status(key: string, jobId: string) {
    if (key !== keyId || jobId !== "11111111-1111-4111-8111-111111111111") return null;
    return {
      eventId: "event-id", jobId, status: "pending", attemptCount: 0,
      lastErrorCode: null, createdAt: "2026-09-28T09:00:00Z", completedAt: null,
    };
  }
}

describe("CLEAN-014 authenticated event adapter", () => {
  it("accepts one signed event and gives its worker status without exposing payload", async () => {
    const repository = new FakeRepository();
    const path = "/api/integrations/events/v1";
    const response = await handleIntegrationEventPost(
      signed("POST", path, JSON.stringify(event)), repository, config, now,
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: true, duplicate: false, jobId: "job-id" });
    expect(repository.accepted[0]?.payload).toMatchObject({
      accountExternalId: "site-number-1",
      messages: [{ externalMessageId: "message-1", senderId: "worker-1" }],
    });
    const statusPath = "/api/integrations/events/v1/jobs/11111111-1111-4111-8111-111111111111";
    const status = await handleIntegrationEventStatus(
      signed("GET", statusPath), repository, config,
      "11111111-1111-4111-8111-111111111111", now,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ status: "pending", attemptCount: 0 });
  });

  it("rejects forged and stale requests before persistence", async () => {
    const repository = new FakeRepository();
    const path = "/api/integrations/events/v1";
    const body = JSON.stringify(event);
    expect((await handleIntegrationEventPost(
      signed("POST", path, body, { signer: "wrong-secret-with-at-least-32-characters" }),
      repository, config, now,
    )).status).toBe(401);
    expect((await handleIntegrationEventPost(
      signed("POST", path, body, { timestamp: now - 301 }),
      repository, config, now,
    )).status).toBe(401);
    expect(repository.accepted).toHaveLength(0);
  });

  it("detects nonce replay, idempotent retry, and conflicting message identity", async () => {
    const repository = new FakeRepository();
    const path = "/api/integrations/events/v1";
    const body = JSON.stringify(event);
    expect((await handleIntegrationEventPost(signed("POST", path, body), repository, config, now)).status).toBe(202);
    expect((await handleIntegrationEventPost(signed("POST", path, body), repository, config, now)).status).toBe(409);
    const retry = await handleIntegrationEventPost(
      signed("POST", path, body, { nonce: "another_nonce_123456" }), repository, config, now,
    );
    expect(await retry.json()).toMatchObject({ duplicate: true });
    const changed = await handleIntegrationEventPost(
      signed("POST", path, JSON.stringify({ ...event, text: "Different text" }), { nonce: "third_nonce_1234567" }),
      repository, config, now,
    );
    expect(changed.status).toBe(409);
  });

  it("rejects unsupported media and malformed input without acknowledging", async () => {
    const repository = new FakeRepository();
    const path = "/api/integrations/events/v1";
    const media = { ...event, media: [{ externalId: "media-1", kind: "image" }] };
    const result = await handleIntegrationEventPost(
      signed("POST", path, JSON.stringify(media)), repository, config, now,
    );
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({ error: "media_transport_not_configured" });
    const malformed = await handleIntegrationEventPost(
      signed("POST", path, JSON.stringify({ ...event, organizationId: "attacker-org" }), { nonce: "fourth_nonce_123456" }),
      repository, config, now,
    );
    expect(malformed.status).toBe(422);
    expect(repository.accepted).toHaveLength(0);
  });
});
