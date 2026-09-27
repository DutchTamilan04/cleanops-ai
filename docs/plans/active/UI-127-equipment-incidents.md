# UI-127: Equipment and incident presentation

Issue: [#127](https://github.com/niru2015/cleanops-ai/issues/127), under #113.

## Scope

Apply existing badges, alerts and buttons to the portfolio equipment register
and fixed-scenario incident desk. Keep source narratives attributed, show
"cause undetermined" and "reported" prominently, and never imply a repair
has been completed. Preserve the current no-fixture, empty and restricted
states, server actions and site access.

Base and PR target: `codex/ui-preview`. No equipment model, inspection,
repair workflow, service, action or migration change.

## Acceptance

- [x] Equipment and incident states use shared components with reported and completed meaning kept distinct.
- [x] Existing incident correction and equipment-report actions persist, with no repair claim.
- [x] Supervisor and Area Manager desktop/390px browser checks pass, including fixed-fixture and no-fixture states.
- [x] Typecheck, lint, 89 unit tests and production build pass locally; focused PR reports CI separately.

## Verification

The isolated local synthetic database was reset before the empty-state browser run and again before the full incident journey. The two new role/responsive checks passed. The existing record → wording correction → equipment report → report prepare/release browser test passed; screenshots include populated desktop and 390px incident views. No real maintenance completion is created by this workflow.
