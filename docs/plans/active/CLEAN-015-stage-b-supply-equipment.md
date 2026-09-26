# CLEAN-015 Stage B supply and equipment replay — active plan

Issue #28, scoped to the released #30 supply and #31 equipment workflows. Branch
`codex/scenario-supply-equipment` from `main` at `b16dfe3`. Existing hosted version 8
`finance-showcase` remains reconstructible from its registry; version 9 is a separate
synthetic data release.

## Acceptance

- Generate normal, high and partial supply cases through request, approval, order, receipt,
  stock movement and approved expense-link RPCs, including idempotent retries.
- Generate healthy and repeat-repair equipment cases through checklist, inspection,
  report, maintenance, independent return and approved repair-cost RPCs.
- Derive expected source controls and fail assertions on missing or mismatched rows.
- Reset the local version 9 run without affecting other tenants; preserve version 8
  registry reconstruction and guarded reset.

## Changed paths and checks

`fixtures/scenarios/finance-showcase/scenario.json`, `src/demo/scenario-{schema,plan}.mjs`,
`scripts/{demo-scenario,test-demo-scenario}.mjs`, `tests/scenario-plan.test.mjs`,
`docs/demo/DATA_FACTORY.md`, and `docs/PROCESS_FLOWS.md`.

Local checks: typecheck, lint, 94 unit tests, build, `db:reset`, 458 database tests,
and `test:scenario` generate/assert/presenter/reset plus tenant isolation passed.
The browser UI did not change in this slice. Hosted version 9 generation, UAT and
cleanup have not run. Hosted version 9 reset remains disabled pending a separately
reviewed exact-scope cleanup and approval.

## Next step

Review and merge this branch, then plan the hosted version 8 cleanup and version 9
release separately. Keep issue #28 open for remaining scenario packs and the full
finance overview/UAT acceptance. Issue #34 owns the source-backed manager overview.
