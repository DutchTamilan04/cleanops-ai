# CLEAN-014 — canonical intake acceptance

Issue: #27. Current acceptance branch: `codex/issue-27-completion`, based on current main.

The original first slice is merged. The private image, Director inbox,
cross-transport identity and production worker/alert slices are merged and closed
under #162–#165. This branch surfaces forwarding/synthetic provenance at the
site handoff, keeps non-WhatsApp finance drafts correctly labelled, excludes
plain supply requests from expense capture, and adds
[operator acceptance](../../operations/CLEAN_014_UAT.md).

Acceptance for this branch: migration applies cleanly; Director/site read gates
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

Still to verify for parent #27: a valid signed HTTP `202` and completed job on
the hosted adapter, and an observed automatic production recovery cron
invocation. The hosted replay inserted scoped synthetic normalized rows and did
not prove signed ingress. The generic intent/finance handoff matrix passed in
local PostgreSQL and CI. Real Meta/Make and group capability belong to #37 and
need separate authorized sandbox evidence. Keep #27 open until its remaining
acceptance evidence is recorded.
