import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { processNextIngressJob } from "@/services/ingress-worker";
import type { IngressRepository } from "@/services/ingress-repository";

type AdapterWorkerRepository = IngressRepository & {
  queueHealth(): Promise<{
    pendingCount: number; processingCount: number; failedCount: number;
    oldestPendingAt: string | null;
  }>;
  retryFailedAdapterJob(jobId: string): Promise<boolean>;
};

function authorized(request: Request, secret: string) {
  if (secret.length < 32) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleIntegrationWorker(
  request: Request, repository: AdapterWorkerRepository | (() => AdapterWorkerRepository), secret: string,
) {
  if (!authorized(request, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const adapter = typeof repository === "function" ? repository() : repository;
    if (request.method === "POST") {
      const command = z.object({ retryJobId: z.string().uuid() }).strict()
        .safeParse(await request.json());
      if (!command.success) return Response.json({ error: "invalid_command" }, { status: 400 });
      const retried = await adapter.retryFailedAdapterJob(command.data.retryJobId);
      return Response.json({ retried }, { status: retried ? 200 : 404 });
    }

    let processed = 0;
    let failed = 0;
    for (let index = 0; index < 20; index += 1) {
      const result = await processNextIngressJob(adapter, {
        workerId: "integration-event-worker", leaseSeconds: 60,
      });
      if (result.status === "idle") break;
      processed += result.status === "succeeded" ? 1 : 0;
      failed += result.status === "pending" || result.status === "failed" ? 1 : 0;
    }
    const health = await adapter.queueHealth();
    return Response.json({ processed, failed, health }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
