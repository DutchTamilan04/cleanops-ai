# WhatsApp vertical slice

## Supported boundary

Official integration target: dedicated WhatsApp Business number using the supported Cloud API.
Workers message that number. Do not assume access to arbitrary existing WhatsApp groups.
Adapters: WhatsAppBusinessAdapter (P4), MockLegacyWhatsAppGroupAdapter (P2), PWAAdapter (P3).
Legacy UI label: “Simulated legacy group ingestion — customer availability unverified”.
Live group support requires a separate capability review and ADR; no scraping dependency.

## Make transport adapter

The versioned route `POST /api/integrations/make/whatsapp/v1` accepts the flattened event
bundle emitted by Make's official `whatsapp-business-cloud:watchEvents2` module. It is an
optional transport for supported Cloud API events; it does not replace the Meta raw-signature
route and does not prove group-message capability.

The route requires a separate server-only bearer credential, validates the Make payload,
rebuilds the canonical provider envelope and then reuses the same service-only WhatsApp
repository. Receiving phone number resolves the organization in `integration_accounts`;
Make cannot supply a tenant identifier. Accepted inbound messages are persisted with a durable
processing job before the route returns `202`. Delivery statuses are recorded separately and
never become operational messages. Replays use the existing account/envelope/message dedupe.

Make configuration: Watch Events -> HTTP v4 Make a request. POST URL-encoded scalar fields to the
versioned route, with `Authorization: Bearer <scoped adapter token>`. Do not pass the whole Make
bundle through `toString`: Make renders nested collections as `{object}`, which is not JSON. Map the
event, account, first message/media and first delivery-status fields individually; URL encoding
preserves message quotes, newlines and ampersands. The official trigger emits one flattened event
bundle per observed callback in the verified scenario.

Stop on HTTP errors so failed persistence remains visible. Attach a bounded `Break` error handler to
the HTTP module so transient failures enter Make's incomplete-execution queue for retry rather than
silently dropping the event. Store only the scoped adapter credential in Make; never store a
Supabase service/secret key there.

The current official Make trigger exposes generic Cloud API events rather than a dedicated group
trigger. Do not claim existing WhatsApp group capture until an authorized group test produces a
payload and current Meta account eligibility, participant/thread identifiers, media handling,
terms and recovery behaviour are verified. If it does not, use the separately approved provider
or supervisor-forward/PWA fallback recorded in the group-capability issue.

## Provider-neutral event adapter (CLEAN-014 first slice)

`POST /api/integrations/events/v1` is a separate, opt-in, **text-only** adapter for
registered external accounts. The sender supplies no tenant or site role. A server-held HMAC key
ID maps to one enabled `event_adapter` integration account, one organization, one site, one
source and the `message:write` capability in `integration_adapter_credentials`. The key
secret lives only in `CLEANOPS_EVENT_ADAPTER_KEYS` on the app server, never in the database
or Make configuration that also has a privileged key. Create a new key ID for rotation, overlap
briefly, then disable the old credential. Set `CLEANOPS_EVENT_ADAPTER_ENABLED=true` only after
provisioning the matching database row and secret.

The exact UTF-8 JSON request body has a 64 KB limit and this versioned shape:

```json
{
  "schemaVersion": 1,
  "source": "whatsapp",
  "sourceAccountId": "registered-account-id",
  "externalEventId": "source-event-id",
  "externalMessageId": "provider-message-id",
  "threadId": "source-thread-id",
  "senderReference": "source-sender-id",
  "occurredAt": "2026-09-28T09:00:00Z",
  "text": "Fuel for the Hastings job tonight.",
  "media": [],
  "parentReference": "optional-source-reply-id",
  "forwardedBy": "optional-forwarder-reference",
  "synthetic": true
}
```

`externalMessageId`, `threadId`, `senderReference`, `parentReference` and
`forwardedBy` are optional, but unknown identity stays unknown in review. No worker or
site authorization is inferred from message text. Parent/forwarder/synthetic provenance is
stored service-only in `integration_adapter_event_provenance`. Media references are rejected
with `422 media_transport_not_configured` in this first slice: the adapter never reports
success for an attachment it cannot download and verify. The existing signed Meta webhook
remains the supported media path.

Set headers `X-CleanOps-Key-Id`, `X-CleanOps-Timestamp` (Unix seconds),
`X-CleanOps-Nonce` (16–128 URL-safe characters) and `X-CleanOps-Signature` (lowercase
hex HMAC-SHA256). Sign the following six newline-separated fields, with no trailing newline:
`POST`, `/api/integrations/events/v1`, key ID, timestamp, nonce, SHA-256 hex of the exact request
body. The server accepts a five-minute clock window; the database consumes each nonce
atomically with the event and pending job. Retry a failed transport with a **new nonce**.
The account plus source message ID dedupes business effects even when the transport event ID
changes. A reused message ID with changed normalized contents returns `409`.

`202` returns `eventId`, `jobId` and `duplicate`: it means durable acceptance, not
processing or financial approval. To check a job, sign `GET`,
`/api/integrations/events/v1/jobs/<jobId>`, key ID, timestamp, a nonce and the SHA-256 of
an empty body. The scoped response gives status, attempts and a safe error code, never raw
message content. Unknown job IDs and other tenant jobs return `404`.

The generic worker target `GET /api/internal/integrations/worker` requires a separate
`CLEANOPS_EVENT_WORKER_TOKEN` (or Vercel `CRON_SECRET`) of at least 32 characters.
Each call processes up to 20 adapter jobs and returns pending/processing/failed counts and
oldest pending time. `POST` with `{"retryJobId":"<uuid>"}` retries an adapter failed job
only. Schedule GET from a protected production scheduler and alert on persistent failed jobs
or oldest pending age. Hosting does **not** yet configure that schedule; a deployed route
alone is not evidence of continuous processing. Purge nonce records older than one day as
an operator maintenance task after the scheduler is selected.

After normalization, the existing context and finance candidate triggers run. The review
queue shows a deterministic suggested intent. It is a hint only: Director/Area Manager
confirmation and the existing domain approval gates still control any effect.

## Ingress and normalized contract

Implemented live route `/api/webhooks/whatsapp`: GET subscription verification, POST signed events.
Separate `/api/demo/messages` route: authorized demo access, unavailable in production.
Both reach the same normalization/services after their respective trust checks.
Normalized fields: source, integration_account_id, external_message_id, external_thread_id,
sender_id, occurred_at, received_at, text?, media_refs[], schema_version. Server derives
tenant from the registered receiving account. Provider delivery status events are not messages.

Implemented simulator payload, schema version 1:

```json
{"schemaVersion":1,"eventId":"synthetic-event-1","entries":[{"accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"synthetic-message-1","externalThreadId":"synthetic-thread-1","senderId":"synthetic-sender-1","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic cleaning update","mediaRefs":[],"schemaVersion":1}]}]}
```

One request may contain at most 20 unique accounts and 100 messages per account. The service
splits it into account-scoped envelopes before persistence. The database resolves each external
account to its tenant and atomically creates its envelope plus pending job. A partial database
failure returns `503`; retrying the same event is safe.

1. Verify signature on exact raw bytes using current Meta requirements; validate body limits.
2. Resolve receiving account; split batched entries/messages without cross-account mixing.
3. Transactionally persist accepted envelope and pending processing job, then acknowledge.
   Persistence failure returns retryable failure, never false success. Duplicate accepted
   envelope is acknowledged without repeating effects.
4. Worker normalizes each message; dedupe by account + provider message ID. The registered receiving
   account contributes a deterministic site suggestion, and each media reference is stored as
   pending metadata. Envelope key uses
   provider event identity if available, otherwise stable digest; message dedupe is mandatory
   even if batch boundaries change. Preserve arrival/source times and ordering uncertainty.
5. Map verified sender within account/tenant. Unknown or unverified sender enters review.
6. Resolve authorized shift/site/zone/task per DOMAIN; stale or conflicting context is unresolved.
7. Fetch provider media through authenticated allowlisted endpoints, validate and stage it in
   private Storage, compute hash, finalize evidence record. Reconcile orphan uploads.
   The normalized media row reflects downloaded, quarantined or failed evidence processing state;
   it never issues a public Storage URL.
8. Link role/pair only to compatible task context; create mock/live suggestion once, then review.

## Pairing and review

Explicit #before/#after or QR context precedes inference. No cross-worker/site pairs by
recency alone. After-first delivery waits for its before image or reviewer; never invent one.
Supervisor can confirm worker/task/zone/role or ignore with a reason. Remapping identity and
replaying unresolved events is audited and idempotent. Original content stays unchanged.
Media missing, expired, oversized or unsafe is visible as an actionable failure.

## Reliability defaults

Non-AI processing: maximum 5 attempts, persisted backoff, then failed queue with manual retry.
AI attempts obey AI.md separately. Worker leases recover from crashes. Stage-level dedupe
prevents manual retry from repeating finalized effects. Database approval uses revision checks.
Mock replay includes duplicate, concurrent, out-of-order, unknown sender, mixed batch, stale
context, bad signature, unavailable media and crash-after-upload cases.

CLEAN-003 implements the envelope, message and job boundaries plus local one-job processing.
CLEAN-004 implements synthetic media staging, verified identities, expiring contexts,
deterministic task/pair resolution and the unresolved queue. It uses explicit `#before` and
`#after` labels, never timestamp proximity. Missing, rejected and orphaned objects remain visible
with retry or supervisor actions. CLEAN-009 adds the official adapter without changing the mock contract.

## Outbound and go-live

CLEAN-009 adds an official-account outbox with one logical reply per tenant key, verified-recipient
checks, leased retries and separate sent/delivered/read/failed transport events. Free-form text
requires a current conversation-window expiry; every reply records its consent reference; template
sends require a validated name and language. Transport delivery never updates worker acknowledgement
or task completion. No safety-critical workflow depends on WhatsApp delivery.

The server-only worker target `/api/internal/whatsapp/worker` processes one durable inbound job and
one outbound item per call. `npm run worker:whatsapp` invokes it; the deployment scheduler must call
it repeatedly. Failed media remains visible as missing/quarantined evidence and can be retried with
`npm run worker:whatsapp -- --retry-evidence <evidence-id>`. Five failed sends
enter the monitored failed queue. Provider and database retries preserve the same logical record.

Before enabling, register the dedicated receiving phone number as an enabled
`whatsapp_cloud_api` integration account and verified worker identities. Set only server-side
`WHATSAPP_*` values, then run `npm run whatsapp:readiness`. The read-only check validates the pinned
Graph version, phone access, WABA app subscription, required permissions and approved templates.
Then verify webhook, media and outbound delivery with the customer's Meta sandbox and record the
evidence. Local mocks and database tests do not prove live delivery.

Reference checked 2026-09-14: [Meta-maintained Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).
It documents webhook-driven integration; customer account and group capabilities were not verified.
