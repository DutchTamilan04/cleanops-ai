# Roadmap and release gates

**Current product priority:** Tornado Finance MVP, owned by [#61](https://github.com/niru2015/cleanops-ai/issues/61). Scenario-data rules belong to [#28](https://github.com/niru2015/cleanops-ai/issues/28). This status was revalidated against `main` at `7d16984` and the open GitHub issue list on 2026-09-28. The older phase order and historical issue text must not override newer owner decisions or current code.

For the per-issue evidence and recommendation, read [Open issue revalidation](ISSUE_REVALIDATION_2026-09-28.md). For customer-facing steps, use the [finance training index](../finance/README.md) and [new customer setup](../finance/NEW_CUSTOMER_SETUP.md). Code/migrations/tests are the implementation source of truth; this roadmap distinguishes implemented, synthetic, provider-gated and customer-accepted states.

## What `main` now contains

| Track | Implemented capability | Evidence boundary |
| --- | --- | --- |
| Identity and operations | Active organization membership and site access; casino portfolio, staffing coverage/replacement, cleaner task capture and private evidence; Mock AI suggestion with human correction/approval. | Some connected walkthrough flows use fixed synthetic tasks; live AI adapter code is separate from the displayed Mock AI action. |
| Incidents and client reporting | Neutral incident/equipment intake, computed SLA fixture, explicit Supervisor release and redacted Client view. | Client sees only released reports; a source photo or incident is not automatic client release. |
| Contract foundation | Manual draft and private document upload/extraction; cited proposal decisions; Director approval/activation; version-linked future tasks, staffing, SLA and expected revenue. | Expected revenue is not accepted accounting actual or cash. |
| Finance intake and labour | App/normalized-message candidates, private verified receipts, human claim review, Director posting; approved time, effective Director-only worker rates and immutable labour-cost snapshots. | Existing-group WhatsApp proof and payroll authority are separate. |
| Project and accounting | One-off project source links and contribution; neutral CSV preview/acceptance, immutable/superseded source allocations, deterministic/manual matching, versioned period close and stale reopen. | Manual accounting CSV, not a live Sage feed. Incomplete or stale contribution remains N/A/pending. |
| Manager finance | Site/month comparison, complete-site coverage, source-backed review prompts and audited human review state. | Review thresholds are synthetic/versioned and need customer calibration; prompts do not alter sources. |
| Supply and equipment | Supervisor requests, manager approval/order, receipt/stock history, source-backed checklists, inspections, faults, attributed maintenance, independent return, links to approved repair/supply postings. | Stock/order/repair links are not extra expenses; historical equipment and supply data must be customer verified. |
| Demo and UI | Deterministic synthetic scenario generator/assertions, Tornado Playwright recorder, shared UI system and main promotion PRs #143/#152. | Gate A synthetic evidence is not production acceptance; presenter media/deck refresh is deferred. |

## Finance delivery sequence from here

1. **Confirm the released baseline.** Compare deployed code and migrations with `main`; run source-backed synthetic assertions and role-scoped browser checks. Keep local, CI, preview and hosted evidence separate.
2. **Train and configure a new customer.** Follow [operator-assisted setup](../finance/NEW_CUSTOMER_SETUP.md). Productize audited tenant/site/user provisioning only as a bounded follow-on; the demo scripts are not customer onboarding.
3. **Agree customer accounting policy.** Map one complete month of the supported CSV, source IDs, currency, cost categories, project allocation, asset treatment, expense approval and correction/close ownership. Rehearse one site before widening coverage.
4. **Close concrete finance quality gaps.** Fix the direct labour adjustment HTML step/min mismatch in a focused PR; calibrate overview prompt rules against agreed customer baselines; confirm current hosted migration and role behavior. Preserve existing approved-time, posting and reconciliation contracts.
5. **Prove providers and pilot scope.** [#37](https://github.com/niru2015/cleanops-ai/issues/37) owns live Make/WhatsApp capability and existing-group decision; [#38](https://github.com/niru2015/cleanops-ai/issues/38) owns broader manager/device/customer pilot acceptance. A Sage API connector, payroll integration or multi-organization selector needs its own approved scope rather than being inferred from the MVP.

## Outstanding issue and release gates

| Priority | Issues | Current decision |
| --- | --- | --- |
| P0 finance parent | [#61](https://github.com/niru2015/cleanops-ai/issues/61) | Keep open through customer source mapping, current deployed acceptance and scoped pilot; core finance paths are implemented. |
| P0 transport foundation | [#27](https://github.com/niru2015/cleanops-ai/issues/27) | Generic authenticated event API and multi-type resolution remain open; reuse durable ingress and finance candidate model. |
| Pilot/provider | [#37](https://github.com/niru2015/cleanops-ai/issues/37), [#38](https://github.com/niru2015/cleanops-ai/issues/38) | Live-channel capability, physical-device/human rehearsal and customer pilot authorization are not proven by static code or Gate A synthetic runs. |
| Later manager operations | [#29](https://github.com/niru2015/cleanops-ai/issues/29), [#32](https://github.com/niru2015/cleanops-ai/issues/32), [#36](https://github.com/niru2015/cleanops-ai/issues/36) | Announcements, absence register and cross-shift handover/complaint closure remain independent work. |
| Historical parent | [#24](https://github.com/niru2015/cleanops-ai/issues/24) | Keep as an umbrella; reconcile its older status/order against this current roadmap. |
| UI acceptance/closure review | [#113](https://github.com/niru2015/cleanops-ai/issues/113), [#125](https://github.com/niru2015/cleanops-ai/issues/125)–[#129](https://github.com/niru2015/cleanops-ai/issues/129) | Main contains selected cosmetics via #143/#152; reconcile final acceptance and preview-workflow deviation before closing. |
| Deferred presenter media | [#114](https://github.com/niru2015/cleanops-ai/issues/114)–[#116](https://github.com/niru2015/cleanops-ai/issues/116) | Owner deferred training video/deck refresh until UI work is stable. Re-record against an exact current run/commit. |

## Release evidence required

- **Application:** typecheck, lint, tests and production build for changed code.
- **Database:** migration ledger, RLS/tenant/site isolation, state/idempotency and reset tests for changed persistence. Local reset is not a hosted migration.
- **Browser:** named role, site, state, desktop/mobile layout and denied path on the code under review.
- **Hosted:** deployed commit, actual migration/version, read-only/source-backed role journey and explicit customer authorization before writes to customer data.
- **Finance:** one source record through each human gate to accepted accounting allocation and current close, with no double-counting and explicit N/A for incomplete coverage.
- **Pilot:** owner-approved scope, provider readiness, privacy/retention/support decisions, device and recovery checks. Do not call synthetic Gate A a live production pilot.

## Historical implementation map

Completed plans for CLEAN-001–011, CLEAN-026 and CLEAN-027 remain under [completed plans](completed/README.md). The later finance, supply, equipment and manager implementations are described by current code, migrations, [technical process flows](../PROCESS_FLOWS.md) and the [open issue audit](ISSUE_REVALIDATION_2026-09-28.md). Keep one bounded issue/PR per new change, and update technical and operator docs when a data path changes.
