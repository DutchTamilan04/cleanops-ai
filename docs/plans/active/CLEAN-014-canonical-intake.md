# CLEAN-014 — canonical event adapter first slice

Issue: #27. Branch: `codex/issue-27-canonical-intake`, based on current main.

Scope: text-only signed provider-neutral endpoint, account/site/capability credentials,
atomic nonce/event/job persistence, adapter-only worker claim, scoped status, deterministic
review intent, reuse of existing finance candidate trigger and message context queue.

Acceptance checks: application typecheck/lint/test/build; clean PostgreSQL migration and
isolation suite; forged/stale/replayed/cross-account/duplicate/conflicting-message tests;
job claim/completion and finance-candidate assertions; no media falsely accepted.

Remaining #27 work: authenticated media transport, unknown-site organization inbox and
broader supervisor resolution, durable deployment scheduler/alerts, cross-transport logical
dedupe, provider sandbox proof. Do not close #27 from this slice.
