# Canonical event adapter worker runbook

## Release setup

The signed adapter persists one event and pending job before returning `202`.
The route then starts a best-effort Next.js `after()` drain of at most five jobs.
That callback is not the durability guarantee: leased Postgres jobs survive a
function crash. The production `vercel.json` schedule invokes
`GET /api/internal/integrations/worker` at 03:00 UTC daily to recover remaining
work. One invocation starts at most 20 jobs and stops starting new jobs after
20 seconds; an already-running database call may finish later. The schedule is
UTC, independent of casino time zones and daylight-saving changes.

Provision `CRON_SECRET` as a server-only Vercel production variable with at
least 32 random characters. Vercel sends it as a Bearer token on cron calls.
`CLEANOPS_EVENT_WORKER_TOKEN` is an optional separate server-only token for
manual GET/POST recovery. Never put either token in a browser, fixture, issue,
log, or PR. Configure the adapter's account-scoped signing keys and enable flag
as documented in [WHATSAPP.md](../integrations/WHATSAPP.md). Apply the adapter
and queue-health migrations before enabling intake. Confirm a production
deployment lists the daily cron; preview builds do not run it.
When `CLEANOPS_EVENT_ADAPTER_ENABLED` is unset, an authenticated cron returns
`adapter_disabled` without touching the queue; a missing token still returns 401.

This daily cadence works on Vercel Hobby and Pro. On Hobby, Vercel may trigger
the job within the 03:00–03:59 UTC hour; faster than daily cron requires a Pro
plan or an independently approved scheduler. Immediate `after()` processing is
best effort, so this configuration is **not** a guaranteed five-minute latency
service. Do not promise a time-critical production SLA until the cadence and
alerting are upgraded and measured. Vercel does not retry a failed cron call.

## Safe signals

The protected GET response returns counts for pending, processing, retrying
and failed jobs; the oldest pending age, oldest failed time and last success
time; and safe alert codes. It contains no message body, sender, media URL,
credential or tenant data.

| Code | Trigger | Response | Operator action |
|---|---|---|---|
| `retries_pending` | Pending jobs with prior attempts | 200 if otherwise healthy | Watch the next invocation and inspect scoped job status. |
| `pending_age_exceeded` | Oldest pending job is at least five minutes old | 503 | Reinvoke protected GET; check database availability and lease recovery. |
| `dead_letter_present` | At least one adapter job is failed | 503 | Inspect safe job status and reason, fix the cause, then retry the exact failed job. |

The worker writes only aggregate codes/counts to platform logs. Monitor the
`cleanops_adapter_queue_alert` and `cleanops_adapter_background_drain_unavailable`
events plus 503 cron responses. The product owner must assign a named on-call
operator and an HTTP/log alert destination before claiming unattended monitoring.

The `Adapter worker monitor` GitHub Actions workflow checks the protected
production GET independently at 04:10 UTC daily and can be run manually. It
uses repository variable `CLEANOPS_ADAPTER_WORKER_URL` (the stable production
URL ending in `/api/internal/integrations/worker`), repository variable
`CLEANOPS_ADAPTER_ALERT_ASSIGNEE` (the named GitHub operator; defaults to the
repository owner), and repository secret `CLEANOPS_EVENT_WORKER_TOKEN`.
Provision the same random, server-only worker token in Vercel production and
redeploy. A failed response, disabled adapter, timeout or missing configuration
creates one assigned GitHub issue with only the safe code and HTTP status.
The next healthy response closes that issue. The workflow itself fails when it
raises an alert. Confirm the assigned operator receives the GitHub notification
before treating this as delivered alerting. GitHub's scheduled workflow can be
delayed; this monitor improves visibility but is not a latency guarantee or
proof that Vercel's own cron fired. Check Vercel's cron invocation logs separately.

## Recovery

1. Check the Vercel Cron Jobs page for the latest production invocation and
   check the function logs for safe alert codes. Confirm the production
   deployment has `CRON_SECRET`; a 401 is an authentication/configuration fault.
2. Invoke the protected GET to drain up to 20 adapter jobs; repeat only while
   queue health shows progress. The database lease prevents two callers from
   claiming the same job. An unavailable database returns 503 without an
   accepted event disappearing.
3. Read one known job via the account-scoped signed status endpoint. For a
   terminal failed job, fix the underlying issue and send protected POST with
   `{"retryJobId":"<uuid>"}`. Only adapter jobs can be retried by this route.
4. Confirm the job reaches `succeeded` and the source appears once in the
   correct review queue. Do not infer finance posting or evidence approval from
   successful normalization.

The daily GET prunes adapter nonce records older than one day; the signed
request validity window is five minutes. The official WhatsApp worker remains
separate and owns its media jobs.

## Release evidence to record

- CI application, database, pgTAP and browser results for the deployment commit.
- Production cron registration and one authorized invocation with timestamp,
  deployment commit, safe counts and HTTP status.
- A synthetic accepted event's status before and after processing, and a
  denied unauthorized invocation.
- Alert delivery test to the named operator. A 503/log event alone is a signal,
  not evidence that a person was notified.
