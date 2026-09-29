# CLEAN-014 — canonical intake acceptance

Issue: #27. Implementation is merged; the final synthetic acceptance is recorded below.

The original first slice is merged. The private image, Director inbox,
cross-transport identity and production worker/alert slices are merged and closed
under #162–#165. PR #191 surfaced forwarding/synthetic provenance at the
site handoff, keeps non-WhatsApp finance drafts correctly labelled, excludes
plain supply requests from expense capture, and adds
[operator acceptance](../../operations/CLEAN_014_UAT.md).

Acceptance for PR #191: migration applies cleanly; Director/site read gates
retain isolation; original sender and forwarder stay distinct after site
assignment; synthetic adapter messages are visibly marked; supply/equipment
messages remain operational hints; a non-WhatsApp receipt creates one correctly
labelled draft with no posting. Run application typecheck/lint/test/build, the
clean PostgreSQL and pgTAP suites, and the changed browser journeys.

The 2026-09-29 hosted synthetic review replay passed on production commit
`61b64d0` after migration `20260929021011` was applied. Director assignment
preserved original sender, forwarder and synthetic marker in site review; a
non-WhatsApp receipt produced one pending Integration draft; a plain supply
request produced no finance draft or expense claim. All temporary rows were
removed. See the dated result in [operator acceptance](../../operations/CLEAN_014_UAT.md).

At 03:16:28 UTC on 2026-09-29, Vercel production runtime logs showed a
`GET /api/internal/integrations/worker` response of 200 on the same main
deployment. No manual worker call was made in that window; this is consistent
with the scheduled recovery run.

A controlled preview deployment using the hosted database and a temporary
branch-scoped adapter credential passed signed HTTP acceptance: forged requests
were rejected; a valid receipt returned durable `202` and a completed job;
identical replay yielded one pending finance draft and no claim; a signed image
job completed with private byte/hash verification. Test rows, credential,
preview configuration and deployment were removed. See the dated result in
[operator acceptance](../../operations/CLEAN_014_UAT.md). This does not prove
the production signed route or real Meta/Make delivery.

The 2026-09-29 three-source acceptance run is now recorded in
[operator acceptance](../../operations/CLEAN_014_UAT.md): 24/24 scoped checks
passed against the hosted database through a local main-commit server,
including simulator, app form, signed adapter, malformed/forged/replayed input,
concurrent duplicate, missing-media retry and expired-lease recovery. A
separate hosted query confirmed complete synthetic cleanup. Four focused unit
files passed 14/14 tests. The generic intent/finance handoff matrix had
already passed in local PostgreSQL and CI.

Parent #27 can be evaluated for closure after this evidence is reviewed. The
simulator remains disabled on production by design, and this run did not
exercise the production signed route or cause a hosted database outage. Real
Meta/Make, phone image transfer and existing-group eligibility belong to #37
and need separate authorized sandbox evidence. One isolated media-prepare
`404` from a cleaned diagnostic run did not reproduce in the final run; keep
its artifact available if the symptom recurs.
