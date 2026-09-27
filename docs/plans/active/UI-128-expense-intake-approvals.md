# UI-128: Expense intake and approvals

Issue: [#128](https://github.com/niru2015/cleanops-ai/issues/128), first finance content slice under #113.

## Scope

Restyle `/finance/inbox` and `/finance/expenses` with the shared finance counts,
status badges, alerts and buttons. Group source evidence, reviewed fields and
human decisions in the candidate card. Preserve the existing suggestion,
receipt verification, duplicate, Area Manager review and Director posting
actions, queries and authorization. This PR is a subset of #128 because
contracts, projects, rates, reconciliation and ledger rows warrant their own
reviewable screen slices.

Base and PR target: `codex/ui-preview`. No data path, migration or scenario
factory change.

## Acceptance

- [x] Candidate, reviewed and posted states are visually distinct; duplicate and missing-receipt warnings remain explicit.
- [x] Area Manager cannot post; Director approval still requires the verified receipt and creates one cost posting.
- [x] Director and Area Manager desktop/390px browser checks pass with no horizontal overflow.
- [x] Typecheck, lint, 89 unit tests, build and focused browser journey pass locally; CI is recorded separately.

## Verification

The authenticated synthetic receipt journey exercised source suggestion, human
review, Director posting, provenance drill-through, exact duplicate warning,
and Area Manager review without a verified receipt. The last test run passed
both browser cases. Screenshots in `test-results/ui128-*` show desktop and
390px candidate and claim states. No finance service, action, access or
storage behavior changed.
