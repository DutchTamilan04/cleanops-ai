import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { SupabaseEvidenceObjectStorage, SupabaseEvidenceRepository } from "@/integrations/evidence/supabase-evidence";
import type { AdapterMediaRecord, AdapterMediaRepository } from "@/services/integration-event-media";

function mediaRow(data: unknown): AdapterMediaRecord | null {
  const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
    ? data[0] as Record<string, unknown> : null;
  if (!row) return null;
  if (typeof row.evidence_id !== "string" || typeof row.storage_path !== "string" ||
      !["staged", "ready", "missing", "quarantined"].includes(String(row.processing_status)) ||
      !["image/jpeg", "image/png", "image/webp"].includes(String(row.content_type)) ||
      typeof row.byte_size !== "number" || typeof row.sha256 !== "string") {
    throw new Error("invalid_adapter_media_record");
  }
  return {
    evidenceId: row.evidence_id, storagePath: row.storage_path,
    processingStatus: row.processing_status as AdapterMediaRecord["processingStatus"],
    resolutionCode: typeof row.resolution_code === "string" ? row.resolution_code : null,
    contentType: row.content_type as AdapterMediaRecord["contentType"],
    byteSize: row.byte_size, sha256: row.sha256,
    ticketExpiresAt: typeof row.ticket_expires_at === "string" ? row.ticket_expires_at : null,
  };
}

export class SupabaseAdapterMediaRepository implements AdapterMediaRepository {
  private readonly storage: SupabaseEvidenceObjectStorage;
  private readonly evidence: SupabaseEvidenceRepository;
  constructor(private readonly client: SupabaseClient) {
    this.storage = new SupabaseEvidenceObjectStorage(client);
    this.evidence = new SupabaseEvidenceRepository(client);
  }

  async prepare(keyId: string, nonce: string, jobId: string, mediaId: string, retry: boolean) {
    const { data, error } = await this.client.rpc("prepare_adapter_media_upload", {
      p_key_id: keyId, p_nonce: nonce, p_job_id: jobId,
      p_media_external_id: mediaId, p_retry: retry,
    });
    if (error) throw new Error(error.message);
    return mediaRow(data);
  }

  async get(keyId: string, nonce: string, jobId: string, mediaId: string) {
    const { data, error } = await this.client.rpc("get_adapter_media_upload", {
      p_key_id: keyId, p_nonce: nonce, p_job_id: jobId,
      p_media_external_id: mediaId,
    });
    if (error) throw new Error(error.message);
    return mediaRow(data);
  }

  async createUploadToken(path: string) {
    const { data, error } = await this.client.storage.from("operational-evidence")
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) throw new Error("storage_unavailable");
    return data.token;
  }

  async download(path: string) { return this.storage.download(path); }

  async markProblem(evidenceId: string, status: "missing" | "quarantined", code: string) {
    await this.evidence.markProblem(evidenceId, status, code);
  }

  async finalize(evidenceId: string, sha256: string, contentType: string, byteSize: number) {
    return this.evidence.finalize(evidenceId, sha256, contentType, byteSize);
  }
}

export function createSupabaseAdapterMediaRepository() {
  return new SupabaseAdapterMediaRepository(createPrivilegedSupabaseClient());
}
