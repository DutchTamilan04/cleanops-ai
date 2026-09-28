# UI-129: Supervisor and client report presentation

Issue: [#129](https://github.com/niru2015/cleanops-ai/issues/129), final reporting
child of #113. Base and PR target: `codex/ui-preview`.

## Scope

Use the existing KPI, status, alert and button components for the Supervisor
report and released Client view. Give the private draft gate and released state
distinct visual treatment. Clarify which page prepares/releases and which page
only displays a released snapshot. Preserve all generated figures, N/A safety
wording, release actions and redacted Client fields. No integration, RPC, schema
or reporting data path changes.

## Acceptance

- [x] A draft visibly keeps Client access closed; only release exposes the report.
- [x] The Client sees the released redacted snapshot and a pending-tone N/A safety badge, not a zero.
- [x] Supervisor and Client page subtitles explain the shared navigation label.
- [x] Typecheck, lint, 89 unit tests, production build and local authenticated desktop/390px browser journey pass.
- [x] The existing incident/reporting browser regression passes alongside the new test.

The new browser test was also run alone after a local synthetic database reset,
which exercised prepare and release as the Supervisor and pre/post-release
visibility as the Client. When run after the existing reporting regression, it
accepts the already-released state and checks the released presentation.
CI and preview validation are tracked on the PR separately.
