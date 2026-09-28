import { describe, expect, it, vi } from "vitest";
import {
  drainAdapterJobs, handleIntegrationWorker, type AdapterWorkerRepository,
} from "@/services/integration-event-worker";

const secret = "worker-secret-that-is-longer-than-thirty-two-characters";

function repository(overrides: Partial<AdapterWorkerRepository> = {}): AdapterWorkerRepository {
  return {
    acceptEnvelope: vi.fn(async () => ({ eventId: "event", jobId: "job", duplicate: false })),
    claimJob: vi.fn(async () => null),
    completeJob: vi.fn(async () => ({ insertedCount: 0, messageCount: 0 })),
    failJob: vi.fn(async () => "pending" as const),
    retryFailedJob: vi.fn(async () => false),
    queueHealth: vi.fn(async () => ({
      pendingCount: 0, processingCount: 0, retryingCount: 0, failedCount: 0,
      oldestPendingAt: null, oldestFailedAt: null, lastSucceededAt: null,
    })),
    retryFailedAdapterJob: vi.fn(async () => true),
    pruneNonces: vi.fn(async () => 0),
    expireAdapterMedia: vi.fn(async () => 0),
    ...overrides,
  };
}

function request(method: "GET" | "POST", token = secret, body?: object) {
  return new Request("https://cleanops.example/api/internal/integrations/worker", {
    method, headers: { authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("CLEAN-014D deployed adapter worker", () => {
  it("rejects missing or short credentials before constructing a repository", async () => {
    const factory = vi.fn(() => repository());
    expect((await handleIntegrationWorker(request("GET", "invalid"), factory, [secret])).status).toBe(401);
    expect((await handleIntegrationWorker(request("GET", "short"), factory, ["short"])).status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it("accepts the cron secret and reports a healthy idle queue", async () => {
    const adapter = repository();
    const response = await handleIntegrationWorker(request("GET"), adapter, [secret, ""]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      processed: 0, failed: 0, alertCodes: [],
      expiredMediaCount: 0,
      health: { pendingCount: 0, pendingAgeSeconds: null },
    });
    expect(adapter.pruneNonces).toHaveBeenCalledOnce();
    expect(adapter.expireAdapterMedia).toHaveBeenCalledOnce();
  });

  it("keeps a protected deployed cron inert until the adapter is enabled", async () => {
    const factory = vi.fn(() => repository());
    const response = await handleIntegrationWorker(request("GET"), factory, secret, false);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "adapter_disabled" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("signals stale pending work and dead letters without revealing payloads", async () => {
    const adapter = repository({ queueHealth: vi.fn(async () => ({
      pendingCount: 2, processingCount: 0, retryingCount: 1, failedCount: 1,
      oldestPendingAt: "2026-09-28T09:00:00Z",
      oldestFailedAt: "2026-09-28T09:02:00Z", lastSucceededAt: null,
    })) });
    const signals = await drainAdapterJobs(adapter, 20, Date.parse("2026-09-28T09:06:00Z"));
    expect(signals.health.pendingAgeSeconds).toBe(360);
    expect(signals.alertCodes).toEqual(["dead_letter_present", "pending_age_exceeded", "retries_pending"]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await handleIntegrationWorker(request("GET"), adapter, secret);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).not.toHaveProperty("payload");
      expect(body.alertCodes).toContain("dead_letter_present");
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it("limits retry to the protected adapter command", async () => {
    const adapter = repository();
    const retryJobId = "11111111-1111-4111-8111-111111111111";
    expect((await handleIntegrationWorker(request("POST", secret, { retryJobId: "no" }), adapter, secret)).status).toBe(400);
    const response = await handleIntegrationWorker(request("POST", secret, { retryJobId }), adapter, secret);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ retried: true });
    expect(adapter.retryFailedAdapterJob).toHaveBeenCalledWith(retryJobId);
  });
});
