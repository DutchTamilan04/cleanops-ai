# UI-128: Contract register, editor and review

Issue: [#128](https://github.com/niru2015/cleanops-ai/issues/128), contract screen slice under #113.

## Scope

Apply the shared KPI, status, alert, form-field and button components to the
contract register, manual draft editor and saved-version review. Keep contract
values, version transitions, document extraction decisions, impact preview,
role gates and downstream activation unchanged. The current main branch has a
newer finance tab-context call; this slice must be reconciled selectively at
the later promotion, without restoring the older preview call.

Base and PR target: `codex/ui-preview`. No data path, migration or scenario
factory change.

## Acceptance

- [x] Director and Area Manager can still create/review drafts; operational review remains without commercial terms.
- [x] Draft, review, approved and active states remain visibly distinct, and activation requires the existing impact preview.
- [x] Typecheck, lint, 89 unit tests, build and focused desktop/390px browser journeys pass locally; CI is reported separately.

## Verification

Five authenticated browser tests passed: manual Director activation, Area
Manager assigned-site draft with no approval, return-to-draft and resubmit,
Operations Manager's price-restricted review, and private PDF extraction with
human edits. Responsive screenshots cover the manual editor, draft/approved
review and operational-only view. No service, action, authorization, migration
or generated-scenario behavior changed.
