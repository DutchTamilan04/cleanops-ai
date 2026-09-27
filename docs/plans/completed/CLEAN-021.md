# CLEAN-021 — Manager finance overview and explained exceptions

Status: complete for the source-backed Finance MVP. GitHub issue: #34.

## Outcome

`/finance` gives a Director or assigned Area Manager a site and month comparison built from accepted accounting, current contracts, approved direct costs, time and reconciliation sources. The summary computes direct contribution only for a complete, current closed period. It labels the covered-site subtotal and keeps the selected four-site result N/A while any site is incomplete. Area Managers receive granted-site aggregates without worker rates or raw accounting rows. Other roles are denied internal finance.

Deterministic versioned prompts cover changed closed periods, unmatched costs, pending intake, time exceptions, revenue variance, unusual supply movement and repeated repair costs. Prompts identify their observed value, baseline, period and source; review owner, state and history persist under site authorization. A prompt is a review request, not evidence of misconduct. Stale-close and unmatched-cost prompts open the exact accounting period; a single-source revenue variance opens its contract review.

## Acceptance evidence

- The version 9 `finance-showcase` alternate seed `20260927` has two complete August sites: Grand Villa CAD 1,851.92 recognized revenue, CAD 81.00 labour and CAD 1,770.92 contribution; River Rock CAD 950.00 revenue, CAD 73.09 supplies, CAD 95.24 repairs and CAD 781.67 contribution. The covered-site revenue/contribution totals are CAD 2,801.92 / 2,552.59. The four-site result stays N/A.
- September River Rock shows CAD 6,500 approved operational supplies against the August CAD 73.09 baseline, with its 130 × 5 L request only 50 L received. Grand Villa shows a separate CAD 420, 12 × 5 L request, 60 L received and 130 L on hand. Labels separate request estimates, receipts and stock from approved expense and accounting recognition.
- River Rock's asset links CAD 122.47 and CAD 95.24 approved repair sources, CAD 217.71 across history. Only CAD 95.24 belongs in its August site comparison.
- Hosted UAT checked site/month changes, mobile finance controls and keyboard focus, source drilldowns, persisted review history, Grand Villa Area Manager isolation, forged cross-site selection, Supervisor denial and an empty October N/A state. After PRs #139 and #140 deployed on commit `45dc20a`, June and July prompts opened their matching close controls, and direct River Rock supplies loaded with zero browser console errors.
- A local production browser test induced an auth HTTP outage while retaining an existing synthetic Director session. The finance page showed “Finance workspace unavailable”; a separate signed-out browser still showed “Sign in required.” The outage was not induced on hosted services.

## Verification

- Local database reset and 479 pgTAP assertions covered finance review RLS, source/site checks, history and revoked access.
- The final application change passed `typecheck`, `lint`, 100 unit tests and `build`.
- The version 9 scenario pack and expected manifest were checked with the default and alternate seeds. The manifest is test evidence, not a source of displayed totals.
- Detailed synthetic UAT screenshots and results are in the local ignored `artifacts/tornado-demo/gate-a/finance-issue-34-uat-20260926/` folder.

## Boundaries and deferred work

Period-scoped staffing coverage and notice acknowledgement sources remain unavailable and display N/A, never a fabricated zero or green state. The direct contribution excludes overhead, depreciation and tax and is not net profit. The UI preview branch owns the mobile shell label clipping. The owner deferred the physical iPhone check, training refresh and stakeholder video until later work.
