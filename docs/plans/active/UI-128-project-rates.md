# UI-128: Project contribution and rate history

Issue: [#128](https://github.com/niru2015/cleanops-ai/issues/128), project and rate screen slice under #113.

## Scope

Apply shared KPI cards, status badges, alerts, form fields and buttons to the
one-off project workspace and the Director-only worker cost-rate workspace.
Retain every project revenue/cost detail, source link and action, and keep
expected, invoiced and accounting-recognized amounts distinct. Preserve the
Area Manager's assigned-site scope and lack of worker rate access.

Base and PR target: `codex/ui-preview`. No data path, migration or scenario
factory change.

## Acceptance

- [x] Project contribution remains pending until the existing accounting and cost-close conditions are met.
- [x] Director and Area Manager project journeys, Director rate entry and Area Manager rate restriction remain intact.
- [x] Typecheck, lint, 89 unit tests, production build and desktop/390px browser checks pass locally; CI is tracked separately.

## Verification

Four authenticated browser cases passed across project activation, Director
rate entry and labour posting, Area Manager site/rate restrictions, and
Supervisor time resolution. Director and Area Manager screenshots at desktop
and 390px were inspected. A mobile metric-list wrap was corrected and the
project journey was rerun. No project or rate service, action, authorization,
migration or scenario behavior changed.
