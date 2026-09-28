import { describe, expect, it } from "vitest";
import { IngressRepositoryError, type IngressRepository } from "@/services/ingress-repository";
import { processNextIngressJob } from "@/services/ingress-worker";

describe("CLEAN-014C logical identity conflict", () => {
  it("records a safe permanent conflict code after an otherwise valid leased job", async () => {
    const failures: string[] = [];
    const repository: IngressRepository = {
      async acceptEnvelope() { throw new Error("unused"); },
      async claimJob() {
        return {
          jobId: "job-1", integrationEventId: "event-1", organizationId: "org-1",
          integrationAccountId: "account-1", attemptCount: 1,
          leaseExpiresAt: "2026-09-28T18:00:00Z",
          payload: {
            schemaVersion: 1, providerEventId: null, accountExternalId: "phone-1",
            messages: [{ externalMessageId: "wamid.1", externalThreadId: "sender-1",
              senderId: "sender-1", occurredAt: "2026-09-28T17:00:00Z",
              text: "original", mediaRefs: [], schemaVersion: 1 }],
          },
        };
      },
      async completeJob() { throw new IngressRepositoryError("logical_message_conflict"); },
      async failJob(_jobId, _workerId, code) { failures.push(code); return "failed"; },
      async retryFailedJob() { throw new Error("unused"); },
    };
    const result = await processNextIngressJob(repository, { workerId: "worker-1", leaseSeconds: 60 });
    expect(result).toMatchObject({ status: "failed", errorCode: "logical_message_conflict" });
    expect(failures).toEqual(["logical_message_conflict"]);
  });
});
