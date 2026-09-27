# UI-126: Evidence review presentation

Issue: [#126](https://github.com/niru2015/cleanops-ai/issues/126), under #113.

## Scope

Use the existing status, KPI, alert and button components on the review page.
Keep Mock AI suggestions visually and verbally separate from supervisor decisions.
Preserve private image loading and signed URL handling, correction and approval
actions, revision history, access checks and the empty/restricted states.

Base and PR target: `codex/ui-preview`. No action, service, migration or storage
change.

## Acceptance

- [x] Task summary, task state, suggestions and human decisions use the shared components.
- [x] Mock AI always uses the AI tone and never resembles final approval.
- [x] Existing review/correction/approval browser journey persists after reload.
- [x] Supervisor and restricted role desktop/390px checks pass, including focus and reflow.
- [x] Typecheck, lint, tests and build pass.
- [ ] Focused PR reports CI and preview separately.

## Local evidence

Typecheck, lint, 89 unit tests and production build passed. Three authenticated
Playwright tests passed against the isolated synthetic database: the full pair,
Mock AI, correction, revised submission, human approval and reload journey;
Supervisor desktop/390px keyboard and private review; and Client denial at both
widths. The browser test checks `tone="ai"` for the Mock AI labels and a
separate success alert for approved revision 2. No horizontal overflow was seen.

Screenshots under `test-results/`: `review-approved-desktop.png`,
`review-approved-mobile.png`, `ui126-supervisor-desktop.png`,
`ui126-supervisor-mobile.png`, `ui126-client-restricted-mobile.png`.
Occasional Next aborted-navigation stream log appeared in the local run; tests
passed and the existing review test recorded no browser console errors.
CI and Vercel preview are pending this PR.
