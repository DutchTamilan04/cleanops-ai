import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import type { ClaimedJob } from "@/services/ingress-repository";
import type { EventAdapterRepository } from "@/services/integration-event-adapter";

function firstRow(data: unknown): Record<string, unknown> | null {
  return Array.isArray(data) && data[0] && typeof data[0] === "object"
    ? data[0] as Record<string, unknown> : null;
}

export class SupabaseEventAdapterRepository extends SupabaseIngressRepository implements EventAdapterRepository {
  constructor(client: SupabaseClient) { super(client); }

  async accept(input: Parameters<EventAdapterRepository["accept"]>[0]) {
    const { data, error } = await this.client.rpc("accept_adapter_ingress_event", {
      p_key_id: input.keyId,
      p_source: input.event.source,
      p_external_account_id: input.event.sourceAccountId,
      p_external_event_id: input.event.externalEventId,
      p_nonce: input.nonce,
      p_payload: input.payload,
      p_payload_sha256: input.payloadSha256,
      p_provenance: {
        parentReference: input.event.parentReference ?? null,
        forwardedBy: input.event.forwardedBy ?? null,
        synthetic: input.event.synthetic,
      },
    });
    if (error) throw new Error(error.message);
    const result = firstRow(data);
    if (!result || typeof result.event_id !== "string"
        || typeof result.job_id !== "string" || typeof result.duplicate !== "boolean") {
      throw new Error("invalid_database_response");
    }
    return { eventId: result.event_id, jobId: result.job_id, duplicate: result.duplicate };
  }

  override async claimJob(workerId: string, leaseSeconds: number): Promise<ClaimedJob | null> {
    const { data, error } = await this.client.rpc("claim_adapter_processing_job", {
      p_worker_id: workerId, p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(error.message);
    if (Array.isArray(data) && !data.length) return null;
    const row = firstRow(data);
    if (!row || typeof row.job_id !== "string" || typeof row.integration_event_id !== "string"
        || typeof row.organization_id !== "string" || typeof row.integration_account_id !== "string"
        || typeof row.attempt_count !== "number" || typeof row.lease_expires_at !== "string") {
      throw new Error("invalid_database_response");
    }
    return {
      jobId: row.job_id, integrationEventId: row.integration_event_id,
      organizationId: row.organization_id, integrationAccountId: row.integration_account_id,
      payload: row.payload, attemptCount: row.attempt_count, leaseExpiresAt: row.lease_expires_at,
    };
  }

  async status(keyId: string, jobId: string) {
    const { data, error } = await this.client.rpc("get_adapter_ingress_status", {
      p_key_id: keyId, p_job_id: jobId,
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) return null;
    if (typeof row.event_id !== "string" || typeof row.job_id !== "string"
        || typeof row.status !== "string" || typeof row.attempt_count !== "number"
        || typeof row.created_at !== "string") throw new Error("invalid_database_response");
    return {
      eventId: row.event_id, jobId: row.job_id, status: row.status,
      attemptCount: row.attempt_count,
      lastErrorCode: typeof row.last_error_code === "string" ? row.last_error_code : null,
      createdAt: row.created_at,
      completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    };
  }

  async queueHealth() {
    const { data, error } = await this.client.rpc("get_adapter_queue_health");
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row || typeof row.pending_count !== "number"
        || typeof row.processing_count !== "number"
        || typeof row.failed_count !== "number") throw new Error("invalid_database_response");
    return {
      pendingCount: row.pending_count,
      processingCount: row.processing_count,
      failedCount: row.failed_count,
      oldestPendingAt: typeof row.oldest_pending_at === "string" ? row.oldest_pending_at : null,
    };
  }

  async retryFailedAdapterJob(jobId: string) {
    const { data, error } = await this.client.rpc("retry_failed_adapter_processing_job", {
      p_job_id: jobId,
    });
    if (error || typeof data !== "boolean") throw new Error(error?.message ?? "invalid_database_response");
    return data;
  }
}

export function createSupabaseEventAdapterRepository() {
  return new SupabaseEventAdapterRepository(createPrivilegedSupabaseClient());
}
