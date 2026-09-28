# ADR 015 — Durable adapter jobs with immediate drain and daily recovery

Status: Accepted for the CLEAN-014D implementation, 2026-09-28.

## Context

The signed event adapter returns `202` after an atomic Postgres event/job
write. Its worker route previously needed an external caller, so an accepted
event could remain pending indefinitely. The current Vercel plan is not
assumed to support sub-daily cron. The finance and operational review flows
need timely processing, but a 202 must never claim processing succeeded.

## Decision

After a successful durable 202, use Next.js `after()` to attempt a bounded
five-job drain. Register a protected Vercel cron at 03:00 UTC daily to recover
pending or lease-expired adapter jobs. Cron uses `CRON_SECRET`; a separate
optional server token permits manual recovery. Every worker invocation is
bounded to 20 jobs/20 seconds and can claim only `event_adapter` jobs. The
database remains the queue and source of truth. The 20-second cap stops
starting new jobs; an in-flight database call may outlast it. Emit aggregate queue age,
retry and dead-letter signals without raw message data. The daily worker
also prunes nonces older than one day.

## Alternatives

- A five-minute Vercel cron requires a Pro plan and would make Hobby
  deployments fail. Revisit when the actual hosting plan and latency target
  are approved.
- A laptop process or external Make scenario would introduce a separate
  operational dependency and would not prove unattended deployment.
- Processing before 202 would couple ingress availability to normalization.

## Consequences and revisit trigger

The immediate callback is best effort, and the daily fallback can delay
processing for many hours after a function crash. Vercel does not retry a
failed cron invocation. A named operator, delivery-tested alert and hosted
invocation evidence remain release requirements. Revisit this decision when
the pilot needs a measured latency SLA, message volume exceeds one bounded
daily recovery pass, or the project moves to a faster cron/queue plan.
