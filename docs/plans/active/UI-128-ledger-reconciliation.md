# UI-128: Ledger edit and reconciliation presentation

Issue: [#128](https://github.com/niru2015/cleanops-ai/issues/128), final finance content slice under #113.

## Scope

Convert the inline inventory/labour ledger edit controls to shared form
fields. Keep all field names, values, Director-only edit actions and audited
write handlers. The reconciliation page already uses shared KPI cards, state
badges, alerts, action buttons and manual-match form fields in the preview
base; this slice adds a clear stale-close alert and sizes the correction form.
No matching, linking, balancing or close logic changes.

Base and PR target: `codex/ui-preview`. Reconcile this page selectively when
promoting to `main`, which has newer navigation context and accounting details.
No data path, migration or scenario factory change.

## Acceptance

- [x] Ledger edit fields remain functional and Director-only; Area Manager remains read-only.
- [x] Reconciliation close state and stale warning remain distinct; no close assertion is made from an empty period.
- [x] Typecheck, lint, 89 unit tests, production build and four Director/Area Manager desktop/390px browser checks pass locally; CI is tracked separately.

The browser test creates unique synthetic inventory and direct labour entries in
the isolated local database, opens both edit forms, and cancels without changing
the saved values. The existing direct labour entry field accepts values on its
current `min=0.01`, `step=0.25` grid; a separate input constraint correction
should be considered outside this visual slice.
