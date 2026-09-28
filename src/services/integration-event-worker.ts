import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { processNextIngressJob } from "@/services/ingress-worker";
import type { IngressRepository } from "@/services/ingress-repository";

export type AdapterWorkerRepository = IngressRepository & {
  queueHealth(): Promise<{
    pendingCount: number; processingCount: number; retryingCount: number;
    failedCount: number; oldestPendingAt: string | null;
    oldestFailedAt: string | null; lastSucceededAt: string | null;
  }>;
  retryFailedAdapterJob(jobId: string): Promise<boolean>;
  pruneNonces(): Promise<number>;
  expireAdapterMedia(): Promise<number>;
};

function authorized(request: Request, secrets: string | readonly string[]) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(supplied);
  return (typeof secrets === "string" ? [secrets] : secrets).some((secret) => {
    if (secret.length < 32) return false;
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function drainAdapterJobs(
  adapter: AdapterWorkerRepository, maxJobs = 20, now = Date.now(),
) {
  let processed = 0;
  let failed = 0;
  const startedAt = Date.now();
  for (let index = 0; index < maxJobs && Date.now() - startedAt < 20_000; index += 1) {
    const result = await processNextIngressJob(adapter, {
      workerId: "integration-event-worker", leaseSeconds: 60,
    });
    if (result.status === "idle") break;
    processed += result.status === "succeeded" ? 1 : 0;
    failed += result.status === "pending" || result.status === "failed" ? 1 : 0;
  }
  const health = await adapter.queueHealth();
  const pendingAgeSeconds = health.oldestPendingAt
    ? Math.max(0, Math.floor((now - Date.parse(health.oldestPendingAt)) / 1000)) : null;
  const alertCodes = [
    ...(health.failedCount > 0 ? ["dead_letter_present"] : []),
    ...(pendingAgeSeconds !== null && pendingAgeSeconds >= 300 ? ["pending_age_exceeded"] : []),
    ...(health.retryingCount > 0 ? ["retries_pending"] : []),
  ];
  return { processed, failed, health: { ...health, pendingAgeSeconds }, alertCodes };
}

export async function handleIntegrationWorker(
  request: Request, repository: AdapterWorkerRepository | (() => AdapterWorkerRepository),
  secrets: string | readonly string[], enabled = true,
) {
  if (!authorized(request, secrets)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!enabled) return Response.json({ status: "adapter_disabled" }, {
    headers: { "cache-control": "no-store" },
  });
  try {
    const adapter = typeof repository === "function" ? repository() : repository;
    if (request.method === "POST") {
      const command = z.object({ retryJobId: z.string().uuid() }).strict()
        .safeParse(await request.json());
      if (!command.success) return Response.json({ error: "invalid_command" }, { status: 400 });
      const retried = await adapter.retryFailedAdapterJob(command.data.retryJobId);
      return Response.json({ retried }, { status: retried ? 200 : 404 });
    }

    const result = await drainAdapterJobs(adapter);
    const expiredMediaCount = await adapter.expireAdapterMedia();
    await adapter.pruneNonces();
    if (result.alertCodes.includes("dead_letter_present") || result.alertCodes.includes("pending_age_exceeded")) {
      console.error("cleanops_adapter_queue_alert", JSON.stringify({
        alertCodes: result.alertCodes, health: result.health,
      }));
    }
    return Response.json({ ...result, expiredMediaCount }, { status: result.alertCodes.includes("dead_letter_present") ||
      result.alertCodes.includes("pending_age_exceeded") ? 503 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
