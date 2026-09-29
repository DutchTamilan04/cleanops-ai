import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWhatsAppInboundWorkerConfig } from "@/services/whatsapp-config";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  processInbound: vi.fn(),
  processOutbound: vi.fn(),
  createIngress: vi.fn(() => ({})),
  createEvidence: vi.fn(() => ({ repository: {}, storage: {} })),
}));
vi.mock("@/integrations/whatsapp/supabase-whatsapp", () => ({
  createSupabaseWhatsAppRepository: mocks.createIngress,
}));
vi.mock("@/integrations/evidence/supabase-evidence", () => ({
  createSupabaseWhatsAppEvidenceDependencies: mocks.createEvidence,
}));
vi.mock("@/integrations/whatsapp/supabase-outbox", () => ({
  createSupabaseWhatsAppOutboxRepository: vi.fn(),
}));
vi.mock("@/services/whatsapp-worker", () => ({
  processNextWhatsAppIngressJob: mocks.processInbound,
  processWhatsAppEvidenceRetry: vi.fn(),
}));
vi.mock("@/services/whatsapp-outbox", () => ({
  processNextWhatsAppReply: mocks.processOutbound,
}));

import { GET } from "@/app/api/internal/whatsapp/worker/route";

const cronSecret = "test-cron-secret-at-least-thirty-two-characters";
const request = (token: string) => new Request("https://cleanops.example/api/internal/whatsapp/worker", {
  headers: { authorization: `Bearer ${token}` },
});

describe("Make-compatible inbound WhatsApp recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLEANOPS_MAKE_WHATSAPP_ENABLED", "true");
    vi.stubEnv("WHATSAPP_CLOUD_ENABLED", "false");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token-at-least-24-characters");
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v23.0");
    vi.stubEnv("CRON_SECRET", cronSecret);
    vi.stubEnv("WHATSAPP_WORKER_TOKEN", "");
  });

  it("requires media access but not raw webhook secrets for the Make transport", () => {
    const config = getWhatsAppInboundWorkerConfig({
      CLEANOPS_MAKE_WHATSAPP_ENABLED: "true",
      WHATSAPP_CLOUD_ENABLED: "false",
      WHATSAPP_ACCESS_TOKEN: "test-access-token-at-least-24-characters",
      WHATSAPP_GRAPH_VERSION: "v23.0",
      CRON_SECRET: cronSecret,
    });
    expect(config).toMatchObject({ enabled: true, graphVersion: "v23.0" });
    expect(config.authTokens).toEqual([cronSecret]);
    expect(() => getWhatsAppInboundWorkerConfig({
      CLEANOPS_MAKE_WHATSAPP_ENABLED: "true",
      WHATSAPP_GRAPH_VERSION: "v23.0",
    })).toThrow("WhatsApp inbound worker is not configured.");
  });

  it("rejects an unauthenticated cron call before claiming work", async () => {
    const response = await GET(request("wrong"));
    expect(response.status).toBe(401);
    expect(mocks.createIngress).not.toHaveBeenCalled();
    expect(mocks.processInbound).not.toHaveBeenCalled();
  });

  it("drains inbound work and never invokes outbound sending", async () => {
    mocks.processInbound.mockResolvedValueOnce({ status: "succeeded" })
      .mockResolvedValueOnce({ status: "idle" });
    const response = await GET(request(cronSecret));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 1, results: ["succeeded", "idle"] });
    expect(mocks.processInbound).toHaveBeenCalledTimes(2);
    expect(mocks.processOutbound).not.toHaveBeenCalled();
  });
});
