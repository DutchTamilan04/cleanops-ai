import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { detectImageContentType } from "@/services/evidence-media";
import { signedRequest, type EventAdapterConfig } from "@/services/integration-event-adapter";

const MAX_BODY_BYTES = 2_048;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const mediaIdSchema = z.string().trim().min(1).max(255);
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), retry: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("finalize") }).strict(),
]);

export type AdapterMediaRecord = {
  evidenceId: string;
  storagePath: string;
  processingStatus: "staged" | "ready" | "missing" | "quarantined";
  resolutionCode: string | null;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  sha256: string;
  ticketExpiresAt: string | null;
};

export interface AdapterMediaRepository {
  prepare(keyId: string, nonce: string, jobId: string, mediaId: string, retry: boolean): Promise<AdapterMediaRecord | null>;
  get(keyId: string, nonce: string, jobId: string, mediaId: string): Promise<AdapterMediaRecord | null>;
  createUploadToken(path: string): Promise<string>;
  download(path: string): Promise<Uint8Array | null>;
  markProblem(evidenceId: string, status: "missing" | "quarantined", code: string): Promise<void>;
  finalize(evidenceId: string, sha256: string, contentType: string, byteSize: number): Promise<{
    processingStatus: string; linkageStatus: string; resolutionCode: string | null;
  }>;
}

function response(body: object, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function handleAdapterMediaPost(
  request: Request, jobId: string, mediaId: string,
  repository: AdapterMediaRepository | (() => AdapterMediaRepository),
  config: EventAdapterConfig, now = Math.floor(Date.now() / 1000),
) {
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!z.string().uuid().safeParse(jobId).success || !mediaIdSchema.safeParse(mediaId).success) {
    return response({ error: "invalid_media_request" }, 400);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ error: "json_required" }, 415);
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return response({ error: "payload_too_large" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return response({ error: "payload_too_large" }, 413);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const auth = signedRequest(request, config, digest, now);
  if (!auth) return response({ error: "invalid_adapter_signature" }, 401);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return response({ error: "invalid_json" }, 400); }
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success) return response({ error: "invalid_media_command" }, 422);

  try {
    const adapter = typeof repository === "function" ? repository() : repository;
    if (parsed.data.action === "prepare") {
      const media = await adapter.prepare(auth.keyId, auth.nonce, jobId, mediaId, parsed.data.retry);
      if (!media) return response({ error: "media_not_found" }, 404);
      if (media.processingStatus !== "staged") {
        return response({ evidenceId: media.evidenceId, status: media.processingStatus,
          resolutionCode: media.resolutionCode }, media.processingStatus === "ready" ? 200 : 409);
      }
      const token = await adapter.createUploadToken(media.storagePath);
      return response({ evidenceId: media.evidenceId, status: "staged",
        upload: { bucket: "operational-evidence", path: media.storagePath,
          token, expiresAt: media.ticketExpiresAt } }, 200);
    }

    const media = await adapter.get(auth.keyId, auth.nonce, jobId, mediaId);
    if (!media) return response({ error: "media_not_found" }, 404);
    if (media.processingStatus === "ready") {
      return response({ evidenceId: media.evidenceId, status: "ready" }, 200);
    }
    if (media.processingStatus !== "staged") {
      return response({ evidenceId: media.evidenceId, status: media.processingStatus,
        resolutionCode: media.resolutionCode }, 409);
    }
    if (!media.ticketExpiresAt || Date.parse(media.ticketExpiresAt) <= now * 1000) {
      await adapter.markProblem(media.evidenceId, "missing", "adapter_media_timeout");
      return response({ evidenceId: media.evidenceId, status: "missing",
        resolutionCode: "adapter_media_timeout" }, 410);
    }
    const uploaded = await adapter.download(media.storagePath);
    if (!uploaded) {
      await adapter.markProblem(media.evidenceId, "missing", "adapter_media_missing");
      return response({ evidenceId: media.evidenceId, status: "missing",
        resolutionCode: "adapter_media_missing" }, 409);
    }
    const actualType = detectImageContentType(uploaded);
    const actualHash = createHash("sha256").update(uploaded).digest("hex");
    if (uploaded.byteLength > MAX_MEDIA_BYTES || uploaded.byteLength !== media.byteSize ||
        actualType !== media.contentType || actualHash !== media.sha256) {
      await adapter.markProblem(media.evidenceId, "quarantined", "adapter_media_integrity_mismatch");
      return response({ evidenceId: media.evidenceId, status: "quarantined",
        resolutionCode: "adapter_media_integrity_mismatch" }, 422);
    }
    const result = await adapter.finalize(media.evidenceId, actualHash, actualType, uploaded.byteLength);
    return response({ evidenceId: media.evidenceId, status: result.processingStatus,
      linkageStatus: result.linkageStatus, resolutionCode: result.resolutionCode }, 200);
  } catch (error) {
    if (error instanceof Error && error.message.includes("adapter_replay_detected")) {
      return response({ error: "replay_detected" }, 409);
    }
    return response({ error: "media_unavailable" }, 503);
  }
}
