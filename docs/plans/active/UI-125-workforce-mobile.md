# UI-125: Workforce and mobile presentation

Issue: [#125](https://github.com/niru2015/cleanops-ai/issues/125), under #113.

## Scope

Apply the existing UI system to Operations staffing, replacement and zone states,
cleaner photo capture, and mobile expense submission. Keep the existing server
access checks, staffing actions, task context, photo/receipt upload logic and
human approval boundaries. Base and PR target: `codex/ui-preview`.

## Acceptance

- [x] Staffing metrics, status, replacement actions and zone states use shared components.
- [x] Mobile task and expense notices, controls and fields use shared components without changing file input behavior.
- [x] Explicit loading, empty, error and restricted states remain available.
- [x] Typecheck, lint, tests and build pass; affected Supervisor/Cleaner browser journeys pass at desktop and 390px.
- [ ] PR records local, CI and preview evidence separately.

## Paths

`src/components/operations-command.tsx`, `mobile-task.tsx`,
`expense-submission.tsx`, `expense-receipt-uploader.tsx`,
`src/app/globals.css`, affected browser tests. No service, action,
migration or scenario change.

## Local evidence

`typecheck`, `lint`, 89 unit tests and production build passed. Six affected
browser tests passed across the local runs: staffing assignment/check-in, real
before/after private photo upload, Cleaner receipt submission and Director
approval, Area Manager missing-receipt gate, and the new Supervisor/Cleaner
role and responsive checks. The final two role checks passed again after the
last presentation edits. Tests used only the isolated synthetic local database.

The E2E runner now links its synthetic Cleaner Auth account to seeded Worker 182;
previously that test account correctly saw "Task unavailable" because its worker
link remained a seeded placeholder. Product authorization was unchanged.

Desktop and 390px screenshots: `test-results/ui125-workforce-desktop.png`,
`ui125-workforce-mobile.png`, `ui125-capture-mobile.png`, and
`ui125-expense-mobile.png`. The screenshots show the Operations metrics, role
state, task capture and expense form without horizontal overflow. CI and
preview deployment remain to be checked after the focused PR is opened.
