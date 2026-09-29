import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  handlePost: vi.fn(),
  drain: vi.fn(),
  createRepository: vi.fn(() => ({})),
}));
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => { mocks.callbacks.push(callback); },
}));
vi.mock("@/integrations/whatsapp/supabase-whatsapp", () => ({
  createSupabaseWhatsAppRepository: mocks.createRepository,
}));
vi.mock("@/services/make-whatsapp-ingress", () => ({
  getMakeWhatsAppIngressConfig: () => ({ enabled: true, token: "test-token" }),
  handleMakeWhatsAppPost: mocks.handlePost,
}));
vi.mock("@/services/whatsapp-inbound-drain", () => ({
  drainWhatsAppInboundJobs: mocks.drain,
}));

import { POST } from "@/app/api/integrations/make/whatsapp/v1/route";

const request = () => new Request("https://cleanops.example/api/integrations/make/whatsapp/v1", {
  method: "POST",
});

describe("Make WhatsApp immediate inbound drain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    vi.stubEnv("CLEANOPS_MAKE_WHATSAPP_ENABLED", "true");
    vi.stubEnv("WHATSAPP_CLOUD_ENABLED", "false");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token-at-least-24-characters");
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v23.0");
    mocks.drain.mockResolvedValue({ processed: 1, results: ["succeeded", "idle"] });
  });

  it("schedules inbound work only after durable acceptance", async () => {
    mocks.handlePost.mockResolvedValue(new Response(null, { status: 202 }));
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(mocks.drain).not.toHaveBeenCalled();
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]();
    expect(mocks.drain).toHaveBeenCalledTimes(1);
  });

  it("does not schedule processing for a rejected callback", async () => {
    mocks.handlePost.mockResolvedValue(new Response(null, { status: 400 }));
    expect((await POST(request())).status).toBe(400);
    expect(mocks.callbacks).toHaveLength(0);
    expect(mocks.drain).not.toHaveBeenCalled();
  });
});
