import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleAdapterMediaPost, type AdapterMediaRecord, type AdapterMediaRepository } from "@/services/integration-event-media";

const path = "/api/integrations/events/v1/jobs/11111111-1111-4111-8111-111111111111/media/photo-1";
const secret = "media-adapter-secret-with-at-least-32-characters";
const config = { enabled: true, keys: { adapter_media_key: secret } };
const now = 1_791_000_000;
const png = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64",
));
const sha256 = createHash("sha256").update(png).digest("hex");

function signed(action: "prepare" | "finalize", nonce: string, retry = false, signer = secret) {
  const body = JSON.stringify(action === "prepare" ? { action, retry } : { action });
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", signer).update([
    "POST", path, "adapter_media_key", String(now), nonce, digest,
  ].join("\n")).digest("hex");
  return new Request(`https://cleanops.example${path}`, { method: "POST", body,
    headers: { "content-type": "application/json", "x-cleanops-key-id": "adapter_media_key",
      "x-cleanops-timestamp": String(now), "x-cleanops-nonce": nonce,
      "x-cleanops-signature": signature } });
}

class FakeMediaRepository implements AdapterMediaRepository {
  record: AdapterMediaRecord = {
    evidenceId: "evidence-1", storagePath: "org/evidence-1/source.png",
    processingStatus: "staged", resolutionCode: null, contentType: "image/png",
    byteSize: png.byteLength, sha256, ticketExpiresAt: new Date((now + 3600) * 1000).toISOString(),
  };
  uploaded: Uint8Array | null = png;
  finalizations = 0;
  calls = 0;
  async prepare(_key: string, _nonce: string, _job: string, _media: string, retry: boolean) {
    this.calls += 1;
    if (retry && this.record.processingStatus !== "ready") {
      this.record = { ...this.record, processingStatus: "staged", resolutionCode: null,
        storagePath: "org/evidence-1/retry.png" };
    }
    return this.record;
  }
  async get() { this.calls += 1; return this.record; }
  async createUploadToken() { return "scoped-private-upload-token"; }
  async download() { return this.uploaded; }
  async markProblem(_id: string, status: "missing" | "quarantined", code: string) {
    this.record = { ...this.record, processingStatus: status, resolutionCode: code };
  }
  async finalize() {
    this.finalizations += 1;
    this.record = { ...this.record, processingStatus: "ready" };
    return { processingStatus: "ready", linkageStatus: "unresolved", resolutionCode: "unknown_sender" };
  }
}

describe("CLEAN-014A private adapter media", () => {
  it("issues a scoped private upload token and finalizes verified image bytes idempotently", async () => {
    const repository = new FakeMediaRepository();
    const prepared = await handleAdapterMediaPost(signed("prepare", "prepare_nonce_123456"),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(prepared.status).toBe(200);
    expect(await prepared.json()).toMatchObject({ status: "staged", upload: {
      bucket: "operational-evidence", path: "org/evidence-1/source.png",
      token: "scoped-private-upload-token",
    } });
    const finalized = await handleAdapterMediaPost(signed("finalize", "finalize_nonce_123456"),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(finalized.status).toBe(200);
    expect(await finalized.json()).toMatchObject({ status: "ready", linkageStatus: "unresolved" });
    const replay = await handleAdapterMediaPost(signed("finalize", "finalize_nonce_abcdef"),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(replay.status).toBe(200);
    expect(repository.finalizations).toBe(1);
  });

  it("quarantines altered bytes and allows an explicit retry without losing the message", async () => {
    const repository = new FakeMediaRepository();
    repository.uploaded = new Uint8Array([...png, 0]);
    const rejected = await handleAdapterMediaPost(signed("finalize", "integrity_nonce_1234"),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(rejected.status).toBe(422);
    expect(repository.record).toMatchObject({ processingStatus: "quarantined",
      resolutionCode: "adapter_media_integrity_mismatch" });
    expect(repository.finalizations).toBe(0);
    const retry = await handleAdapterMediaPost(signed("prepare", "retry_nonce_12345678", true),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(retry.status).toBe(200);
    expect(repository.record.storagePath).toBe("org/evidence-1/retry.png");
  });

  it("records missing media and denies forged requests before repository access", async () => {
    const repository = new FakeMediaRepository();
    repository.uploaded = null;
    const missing = await handleAdapterMediaPost(signed("finalize", "missing_nonce_12345"),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(missing.status).toBe(409);
    expect(repository.record.resolutionCode).toBe("adapter_media_missing");
    const calls = repository.calls;
    const forged = await handleAdapterMediaPost(signed("prepare", "forged_nonce_12345", false, "wrong-secret"),
      "11111111-1111-4111-8111-111111111111", "photo-1", repository, config, now);
    expect(forged.status).toBe(401);
    expect(repository.calls).toBe(calls);
  });
});
