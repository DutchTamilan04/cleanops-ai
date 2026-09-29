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

Still to verify for parent #27: the first automatic production cron invocation
and the hosted end-to-end acceptance record. The generic intent/finance handoff
matrix has a local PostgreSQL test; hosted replay has not been done. Real
Meta/Make and group capability belong to #37 and need separate authorized
sandbox evidence. Do not close #27 from code inspection alone.
