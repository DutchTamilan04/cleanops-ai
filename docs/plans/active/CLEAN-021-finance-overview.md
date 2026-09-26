# CLEAN-021 manager finance overview — active plan

Issue #34 on `codex/finance-overview-exceptions`, based on `main` after #28 version 9
scenario replay. The implemented `/finance` summary already distinguishes accepted
accounting revenue from operational postings and withholds contribution for incomplete
periods. This slice closes the source and exception gaps without adopting pending UI
preview styling.

## Acceptance checks

1. Query only organization and granted sites; Area Manager payload contains no
   worker cost-rate or raw accounting data.
2. Compare selected sites and month from source rows. Keep the all-site contribution
   N/A when any selected site is incomplete; show covered-site count and labelled
   source-backed partial totals separately.
3. Use versioned deterministic rules for supply movement, pending intake/time,
   revenue variance and repeated repairs, with observed value, baseline, period,
   sample size and owning-source links.
4. Persist reviewed exception owner/state/history with explicit site authorization.
5. Verify zero/missing denominators, RLS, alternate seed, browser site/month,
   keyboard and mobile layouts.

Issue #34 now uses the version 9 `tornado-v1` source controls. The August
accepted comparison covers two of four sites; the four-site combined result is
N/A. September supply requests and expenses are operational sources, with no
accepted September revenue. Do not turn either partial subtotal into a total.

## Current verification

- Local `db:reset` and 479 pgTAP assertions pass, including finance review RLS,
  source/site validation, immutable scope, authenticated ownership, history and
  revoked site access.
- `typecheck`, `lint`, 96 unit tests and production `build` pass.
- Authenticated Chromium checks pass for site/month selection, two-site comparison,
  source link, review history, mobile keyboard focus and Area Manager boundary.
- Version 9 `finance-showcase` generated and asserted locally with the default
  and `20260927` alternate seeds. The browser verified August contribution,
  incomplete four-site aggregate, August repeated repair and September supply
  movement with both seeds. The expected manifest is test evidence only.

## Remaining acceptance and release work

The hosted version 9 replay is READY, and authenticated UAT verified the August
covered-site controls, September supply movement, repair/time/intake source
links, role boundaries, mobile finance controls and persisted review history.
That UAT found stale-close and unmatched-cost prompts opening a default
reconciliation period; this branch passes the actual period ID. A single-source
revenue variance now links to its contract review. Recheck both links after the
PR deployment before closing #34.

Period-scoped staffing coverage and notice acknowledgement sources remain
unavailable and display N/A. A direct hosted `/supplies` load also produced a
React hydration error; handle it as a separate browser fix. The UI preview
branch will receive its own later review; training and video remain deferred
at the owner's request.
