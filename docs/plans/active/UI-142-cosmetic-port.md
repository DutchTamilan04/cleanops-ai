# UI-142: Promote existing preview cosmetics

Issue: [#142](https://github.com/niru2015/cleanops-ai/issues/142), under #113.

## Contract

Owner authorized a selective visual promotion onto current main on 2026-09-27.
Base: `8439598a1f89828b42adbcb76bc933532f4ffd42`.
Visual source: `codex/ui-preview` at `5822e9f2cc42d11acae4216c59a61b077c2792fd`.
Apply the implemented fonts, tokens, logo, responsive shell/login, 12 shared UI
modules, and Finance/message-review presentation. Preserve main's data/actions,
authorization, calculation rules, comparison/coverage and finance review history.
Exclude the preview operations-runtime change. No database or scenario changes.

## Plan and acceptance

- [x] Port shared presentation and UI modules; adapt finance summary and CSS to current main.
- [x] Audit form names/actions, role gates, source links, calculations and new main workflows.
- [x] Run typecheck, lint, unit tests and production build.
- [x] Verify authenticated finance actions/navigation, restricted roles and desktop/mobile rendering with local synthetic fixtures.
- [ ] Open a focused promotion PR to main; report CI, deployment and browser evidence separately.

## Paths

`src/components/ui/*`, `src/app/globals.css`, `src/app/layout.tsx`, shell/login and
brand asset; Finance route presentation, `finance-summary`, `finance-workspace`,
`message-context-queue`, finance tabs, design documentation and relevant tests.

## Evidence

Local checks: `typecheck`, `lint`, 108 unit tests and production build passed.
`test:e2e -- --production`: 23 passed, one generated-scenario test skipped;
after `demo:generate` and `demo:assert finance-showcase`, that test passed separately.
Two new browser regressions passed: imported accounting coverage/close/reopen and
Operations Manager/supervisor tab restrictions. Total: 26 distinct browser tests
passed across the runs. Tests used the isolated local `cleanops-ui142-local`
Supabase instance, never the hosted database.

The import regression uses the actual file chooser to avoid selecting a file
before React hydration. Initial test-authoring failures involved broad status/
alert locators and section lookup; final assertions scope the intended controls.
Production browser checks logged no client errors; Next logged occasional aborted
navigation streams during the full suite, without failed actions or assertions.

Main service, integration, migration and server-action paths have no diff. An AST
comparison confirmed preservation of all 14 Finance workspace handlers, the
message-context submit handler and the finance-summary review action.

Browser plugin skill is not available; used repository Playwright tests and CLI.
Desktop/mobile screenshots are generated under `test-results/ui142-*.png` by the
focused test and included in CI's existing browser-evidence artifact. Additional
local screenshots remain outside committed source.

Compatibility adaptations: preserve main's comparison/coverage and exception
actions; retain complete reconciliation IDs and zero diagnostics; exclude the
preview's derived "fully matched" summary; make tabs respect existing route
capabilities; submit the authorized single-site value from a static switcher;
use semantic table headers/captions and wrap full source IDs on phones.

The design target contains future components/states; documentation now separates
the implemented promotion from that target. No new packages or provider claims.

## Next step

Open the promotion PR to main, wait for application/database/Vercel checks, and
complete the protected-branch review/merge requirements. Local verification is
complete; production release is pending.
