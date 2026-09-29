# CLEAN-014 intake acceptance and operator test

Issue: [#27](https://github.com/niru2015/cleanops-ai/issues/27). Provider pilot decision: [#37](https://github.com/niru2015/cleanops-ai/issues/37).

This is the test script for the **implemented** normalized intake path. Use invented
names, messages and images. A signed adapter test is not evidence that Meta or Make
delivered a message. Record the deployment commit and database migration state
before any hosted run.

## Process map

```text
Supported source: Meta signed webhook | optional Make relay | signed event adapter
  -> verify source signature or scoped credential
  -> derive organization and site from registered receiving account
  -> atomically store event + pending processing job
  -> return 202 (durable acceptance, not business completion)
  -> leased worker normalizes one logical message and typed intent hint
  -> private image verification if an image was declared
  -> Director assigns site if the account has no site
  -> Director or Area Manager confirms site task, area and sender context
  -> owning domain review (for example, Finance Inbox) creates or decides a draft
  -> explicit authorized approval/posting in that domain
```

Original sender, optional forwarder and source event remain separate. A forwarder
does not become the original author. A duplicate provider message ID must not
create another logical message or finance draft. A changed payload under that ID
must fail rather than replacing the first record. Intent classification is only
a review hint; words in a message cannot approve expenses, confirm attendance,
consume stock or release a client report.

## Before testing: owner and engineer actions

| Who | Action | Evidence to retain |
|---|---|---|
| Product owner | Choose the dedicated test WhatsApp Business account and number, confirm that CleanOps may use them, and choose one real phone that may send invented text and a synthetic cleaning photo. Decide whether existing groups are in scope; do not infer access from the number. | Account and phone IDs (not access tokens), sender permission, group decision. |
| Product owner | Name a Director and an Area Manager test login with access to the intended casino. Give the engineer the account/phone IDs and approved test window through a secure channel. | Roles, casino grants and test window. |
| Engineer | Apply reviewed migrations and deploy the matching commit; register the receiving account and scoped identities. Put Meta/app secrets and adapter signing keys in server-only configuration; never in a browser or test report. | Migration ledger, commit, redacted configuration checklist. |
| Engineer | Run `npm run whatsapp:readiness` against the chosen test account. Check webhook subscription and the protected worker/alert endpoint. | Readiness result, safe health status, first automatic cron invocation time. |

The phone and Meta account steps are for [#37](https://github.com/niru2015/cleanops-ai/issues/37). Do not enable a live Make or Meta connection solely to run local #27 tests.

## Automated acceptance on the review branch

Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
Run the clean PostgreSQL migration/isolation suite with
`npm run test:db:postgres`; run `npm run test:db` for the pgTAP contracts;
then run `npm run test:e2e -- org-message-resolution.spec.ts finance-adapter-source.spec.ts adapter-private-media.spec.ts`
for the changed browser journeys. Record each command, commit, pass/fail count and any skipped
check. These checks cover signatures, replay, account scope, private upload,
message dedupe, job recovery, role isolation and the Director/site queues.
They do not prove real phone or provider delivery.

## Guided acceptance: what to do and what should appear

Run steps 1–6 first with a **synthetic** registered adapter account in a test
organization. Repeat steps 1, 3, 4 and 6 through the real test WhatsApp number
only after the #37 account is ready. Keep unique source message IDs for each
new scenario. Do not send real customer, staff or patron data.

| Step | Tester action | Expected observation |
|---|---|---|
| 1. Durable text | Engineer submits a signed synthetic text event with a known receiving account, source ID and message ID. | `202` supplies event and job IDs; signed job status becomes `succeeded`; one normalized message appears. `202` alone is not a pass. |
| 2. Identity | Send a signed synthetic forwarded message with **different** `senderReference` and `forwardedBy`. As Director, open `/operations/messages` if the account has no site; assign a casino with a reason. Open the selected casino's queue on `/finance`. | Director inbox shows both references and “Synthetic adapter event.” After assignment the same source ID, sender, forwarder and synthetic marker remain in site review. No task or worker is automatically confirmed. Another organization's account cannot read either queue. |
| 3. Context | As Director or Area Manager, link the correct area/task/worker after checking source evidence. Repeat with an unknown sender and an ambiguous or stale task. | Confirmed context is stored only for the explicitly checked case; unknown/ambiguous cases stay in review. The message text cannot grant a role or select another casino. |
| 4. Finance handoff | Send invented text such as “Fuel receipt for test job.” With an assigned-site test login, submit the same kind of invented text at `/mobile/expenses`. Review the site queue at `/finance` and the Finance Inbox at `/finance/inbox`. | Each logical source yields at most one draft candidate. The original message remains linked. Classification and context confirmation create **no approved expense or ledger posting**. Review/posting uses the existing Finance approval path. |
| 4a. Source and intent separation | Send “Need supplies for site” and, through an approved non-WhatsApp test adapter, “Fuel receipt for test job.” | The first is a supply-request hint with no finance draft. The second is a finance draft labelled “Integration,” not “WhatsApp.” Both still need human review. |
| 5. Private image | Declare a synthetic image with exact byte count and SHA-256; prepare a private upload ticket, upload exact bytes, then finalize with a fresh signature nonce. Repeat with altered bytes and with an expired/missing upload. | Exact bytes become ready private evidence; changed bytes are quarantined; missing upload has a recoverable status. Text remains reviewable. No public image URL or implicit quality approval appears. |
| 6. Recovery and dedupe | Resend the same message with a new transport event/nonce; send changed text under the same provider message ID; simulate a timeout after persistence, a temporary database failure and a worker failure in the isolated test environment. | Identical replay leaves one message/draft; conflicting replay fails safely; timeout retry resolves to the first event; database failure never returns a false accepted result; failed job has a safe status/code and can be retried without duplicate effects. Alert reaches the assigned operator. |

For the **real-phone #37 proof**, send an invented text, then a synthetic photo
with a caption from the authorized phone to the dedicated Business number. Record
the phone send time, redacted provider message ID, CleanOps event/job status,
review screen, private evidence SHA-256, and time to readiness. Repeat the photo
after a simulated worker interruption. If using Make, also record the scenario
execution and incomplete-execution recovery. Never put tokens, phone numbers,
signed upload URLs or unredacted message bodies in the evidence pack.

## Owner walkthrough and evidence sheet

Allow one guided session after the engineer confirms the matching deploy and
migration. You do not need to create an HMAC signature or handle a provider key.

1. Sign in as the Director. Ask the engineer to submit the site-less synthetic
   forwarded event. In `/operations/messages`, show the original sender and
   forwarder as two different references, the synthetic marker, the suggested
   intent and the casino assignment control. Assign it to the agreed test casino.
2. Open that casino at `/finance`. Show the **same** message, references and
   marker in the site review queue. Confirm an area/task only when the source
   evidence supports it. Leave the deliberately unknown sender unresolved.
3. Open `/finance/inbox`. Show the receipt candidate as a draft labelled
   “Integration candidate”; show that the plain supply request is absent from
   the Finance Inbox. Do not press an approval button solely to prove intake.
4. Sign in with an assigned-site app test login and use `/mobile/expenses` to
   submit another invented expense. Return to the Director Finance Inbox to
   show that it is a separate “App candidate.”
5. Ask the engineer to display the redacted job status and worker health
   result. Show the private-image ready/missing/quarantined states only with
   synthetic image bytes; avoid displaying an upload token or signed URL.

Capture a screen recording or these screenshots, with invented names visible:
`01-director-unassigned`, `02-site-context`, `03-finance-integration-draft`,
`04-app-draft`, `05-private-evidence-status`, `06-worker-health`. For each,
record the deployment commit, UTC time, test organization/site, role, source
event ID, expected result, observed result, pass/fail and issue link if it
failed. The engineer should attach redacted `202` and final job status responses,
the migration ledger and the automated-test summary. A browser screenshot
alone does not prove durable persistence or provider delivery.

Use this row for every test, including a failed or skipped one:

| Test ID | Commit / UTC time | Role + synthetic source ID | Expected | Observed and evidence path | Pass / fail / blocked | Follow-up issue |
|---|---|---|---|---|---|---|
| Example: C14-02 | `<commit>` / `<time>` | Director / `<event-id>` | Forwarder survives casino assignment | `<screenshot>` plus job status | `<result>` | `<issue or none>` |

## Additional negative cases and ownership

| Test | Where | Pass condition |
|---|---|---|
| Forged/stale signature, replayed nonce, malformed media, wrong account/site, mixed-account attempt | Automated/local; controlled sandbox only | Rejected before or during atomic persistence; no cross-tenant row or private URL. |
| Concurrent duplicate, after/before reordering, worker lease expiry, media expiry | Automated/local | One logical effect; unresolved ordering remains visible; retry recovers without a second approved effect. |
| Typed intent matrix: finance, absence, supply, equipment, complaint, notice, evidence, unknown | Automated PostgreSQL | Review hints match representative synthetic messages; only the finance example creates a draft; neither app nor adapter submission posts a claim. |
| Make disconnect, provider rate limit, inbound echo/status event, lost connection | #37 provider sandbox, if Make is chosen | Failure visible and recoverable; status/echo does not create an operational message; missing events are not assumed backfilled. |
| Unsupported group | #37 account capability decision | No claim of arbitrary existing-group access without a real authorized payload, eligible account, consent and recovery evidence. |

## Exit decision and record

For #27, attach the automated checks, database isolation results, browser
review result, hosted synthetic event/job and alert evidence, plus the observed
automatic cron invocation. Record which generic intent hints and finance
candidate paths were exercised. Keep #27 open for any unmet acceptance item;
do not use the #37 provider proof as a substitute for local authorization and
reliability checks.

For #37, attach the separate authorized phone-to-private-hash proof and the
direct Meta versus Make decision. Record setup, failures, latency and recovery;
do not mark the provider path live-verified from a mock or code review.

## Dated execution record: 2026-09-29 UTC

PR [#191](https://github.com/niru2015/cleanops-ai/pull/191) merged as
`61b64d0`; application, database, Playwright and Vercel checks passed. Hosted
migration `20260929021011` is recorded in the Supabase ledger, and production
serves the matching commit. A scoped synthetic browser replay in the legacy
demo organization passed six checks: Director provenance, site provenance after
assignment, Integration receipt label, supply request excluded from Finance,
one pending draft, and no automatic claim. Three screenshots and `result.json`
are at `artifacts/tornado-demo/issue27-hosted-20260929-44bc167b/` in the
operator workspace. Temporary account, event, message and draft counts were
verified at zero after cleanup.

The production browser replay injected normalized synthetic rows through the
service client. It did not exercise signed HTTP ingress or provider media. A
separate controlled preview deployment, using the hosted database and a
temporary branch-scoped adapter credential, then passed eight signed HTTP
checks: scoped credential, forged-signature rejection, durable `202`, completed
receipt job, identical-message replay deduplication, one pending finance draft
with no expense claim, completed image job, and verified private image bytes.
The safe result is at
`artifacts/tornado-demo/issue27-signed-preview-20260929-edba7b36/result.json`
in the operator workspace. The run removed its test account, credential,
events, messages, draft and private image; all six checked row counts were
zero. The five temporary preview environment variables and the test deployment
were removed after the run. Production adapter keys and Meta/Make settings were
unchanged. This is signed preview ingress with a hosted database, not a
production-route or real-provider delivery test.

At 03:16:28 UTC, Vercel runtime logs showed
`GET /api/internal/integrations/worker` returning 200 on the same production
deployment; no manual call was made in that window, so this is consistent with
the scheduled recovery run. [Issue #27's evidence comment](https://github.com/niru2015/cleanops-ai/issues/27#issuecomment-5882843601)
tracks the production browser replay. Parent #27 still needs a recorded
same-logical-event comparison across simulator, app form and adapter, plus the
remaining hosted negative/recovery cases before closure. Real phone, Meta/Make
delivery and existing-group eligibility belong to #37.
