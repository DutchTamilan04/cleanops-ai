# Tornado demo recording and UAT

This is a **synthetic CleanOps prototype**. Casino and equipment names are reference names under ADR 008; the recording does not show Tornado customer data, a live Tornado deployment, a live Sage feed, or an existing WhatsApp group connection.

## Run

Use a private shell environment. The default target is a local Next.js app on `127.0.0.1:3000`; Playwright starts it automatically. The local database must already be running, seeded, and have matching demo Auth accounts. For an approved hosted recording, set `TORNADO_DEMO_BASE_URL` to the exact deployment URL. Do not run against an unknown deployment.

```bash
export TORNADO_DEMO_PASSWORD='your-protected-demo-password'
export TORNADO_OPERATIONS_PASSWORD="$TORNADO_DEMO_PASSWORD"
export TORNADO_DEMO_BASE_URL='https://your-approved-demo-host.example'
export TORNADO_EXPECTED_MANIFEST='fixtures/generated/hosted/<project-ref>/finance-showcase/expected.json'
npm run demo:tornado
```

Omit `TORNADO_DEMO_BASE_URL` for local execution. The current synthetic demo uses one shared protected password for finance-showcase and older operational accounts; set both recorder variables to that same value. Without `TORNADO_OPERATIONS_PASSWORD`, the legacy evidence, incident, equipment-report and Mock AI chapters are explicitly skipped; the generated site portfolio, time review and finance chapters still run. `TORNADO_EXPECTED_MANIFEST` is optional; without it UAT-09 is explicitly skipped. The file must describe the *active* scenario run. `npm run demo:assert -- finance-showcase` is a separate read-only source assertion that needs the configured database access. The browser recorder does not reset or generate shared data.

The recorder is read only. The legacy review screen's “Prepare submission” action depends on demo ingress, which is unavailable on the current hosted deployment. The supported mobile task captures Slot Bank 14 evidence; the Mock AI review fixture is a separate Restroom B task. The recorder reports the review preparation state and skips Mock AI when its pair is absent. It never treats Slot Bank 14 uploads as Restroom B evidence.
After an authorized mobile upload, set `TORNADO_EXPECT_MOBILE_EVIDENCE=1` to require the “Submission ready for review” result in UAT-05B.

Use `npm run demo:tornado -- --grep 'UAT-08'` to rerun a chapter. Install the pinned browser with `npx playwright install chromium` if it is missing. The command exits nonzero for failed checks or missing credentials.

For a recorder smoke check without a password, run `TORNADO_DEMO_PUBLIC_ONLY=1 npm run demo:tornado`. This runs only UAT-00 and proves that screenshot, video, trace, and reporters can write artifacts; it does not test authenticated features.

## Presenter reel, run manifest and repeat runs (#114)

`npm run demo:tornado:presenter` runs the same acceptance chapters and then records **one continuous presenter video** from the same storyboard (`tests/tornado/chapters.ts`), paced for presenting: an opening prototype/synthetic-data card, a title card per chapter naming the synthetic account by role, a slow scroll through each key screen, and a closing card. A chapter that is unavailable or fails in that run gets an explicit “not shown in this run” card with the reason; no static or mock screen is substituted. Outputs, under `artifacts/tornado-demo/presenter/`:

| Path | Use |
| --- | --- |
| `tornado-presenter.webm` | Chaptered presenter video (1440×900). No trace is recorded for the reel. |
| `chapters.vtt` | WebVTT chapter markers for the video (approximate to ±0.5 s) |
| `chapters.json` | Per chapter: accounts, shown/skipped/failed, reason, start/end seconds, console errors |

Every run (with or without `--presenter`) now writes `results/run-manifest.json`: target and mode, recorder commit and working-tree state, deployment commit, the scenario's ID, run ID, seed and generator version (from `TORNADO_EXPECTED_MANIFEST`), whether each password was present (never the value), and per chapter the accounts by role, status, skip reason, screenshots and browser console-error count. The runner refuses to write the manifest if a credential value would appear in it. For a hosted run, set `TORNADO_DEPLOYMENT_COMMIT` to the deployed commit; otherwise the manifest says it was not provided. Set `TORNADO_FAIL_ON_CONSOLE_ERRORS=1` to fail a chapter on browser console errors (recorded but not failing by default).

Compare two runs, for example before and after a UI release: `npm run demo:tornado:compare -- first/run-manifest.json second/run-manifest.json`. It reports chapter order, status, screenshot-set, console-error, presenter-chapter and scenario-run differences, and exits nonzero when any exist. Copy a run's `results/` and `presenter/` to protected storage before rerunning, because each run replaces them.

**Local rehearsal:** with local Supabase running and `npm run demo:generate -- finance-showcase` done, `npm run demo:tornado:local` (or `npm run demo:tornado:local -- --presenter`) sets a local-only password on the generated finance-showcase personas, builds the app for production and records that build, as the hosted demo runs. The dev server's on-demand compiles and Fast Refresh reloads interrupted sign-ins in rehearsal, so `TORNADO_LOCAL_DEV=1` (dev server) is only for quick checks. It refuses non-local Supabase or a hosted target. Legacy operations chapters stay skipped locally unless those accounts exist and `TORNADO_OPERATIONS_PASSWORD` is set. Allow about 1 GB of free disk for a presenter run (dev build cache, video and browser temp files).

**Capture tool decision:** Vercel Agent Browser (`agent-browser` 0.38.1, Apache-2.0) was evaluated for rehearsal and capture. It records WebM/MP4 with a visible cursor, but needs a system ffmpeg and an explicit Chrome path, runs each command as a separate process (about 2 s per step), and has no pass/fail reporting, so adopting it would duplicate the pinned UAT. The presenter reel therefore stays on the pinned Playwright runner, which records one continuous video natively without ffmpeg. Agent Browser remains an optional tool for interactive rehearsal only; it is not a dependency.

## Account map

The login picker exposes these synthetic identities. Set the matching account passwords privately. Override emails when a local fixture differs.

| Purpose | Default login | Override |
| --- | --- | --- |
| Finance Director | `finance-showcase.darrel-director@cleanops.example.com` | `TORNADO_FINANCE_DIRECTOR_EMAIL` |
| Finance Area Manager | `finance-showcase.shayana-area@cleanops.example.com` | `TORNADO_FINANCE_AREA_EMAIL` |
| Finance Supervisor denial | `finance-showcase.hardeep@cleanops.example.com` | `TORNADO_FINANCE_SUPERVISOR_EMAIL` |
| Legacy operations Supervisor | `hardeep.supervisor@cleanops.example.com` | `TORNADO_OPERATIONS_SUPERVISOR_EMAIL`; uses `TORNADO_OPERATIONS_PASSWORD` |
| Legacy operations Director | `darrel.director@cleanops.example.com` | `TORNADO_OPERATIONS_DIRECTOR_EMAIL`; uses `TORNADO_OPERATIONS_PASSWORD` |
| Released Grand Villa client report | `demo-client@cleanops.example.com` | Existing legacy synthetic Client account; use its protected demo-role password |
| Finance Client denial | `finance-showcase.scenario-client@cleanops.example.com` | Generated scenario Client; uses the protected finance-showcase password |

The generated finance organization and the legacy operations walkthrough are separate. A single account cannot be assumed to see both. The released-report Client belongs to the legacy Grand Villa organization; the generated scenario Client proves finance denial and cannot see that other organization's report. The recorder uses the generated Supervisor for the casino portfolio/equipment register, the generated Director for time/labour, the legacy Supervisor for review/incidents/equipment issue intake, and the legacy Director for the mobile task result. `npm run demo:provision-logins` provisions named legacy accounts when its protected prerequisites are present; generated finance identities are provisioned by the scenario workflow. Confirm the reserved `demo-client` Auth account and its site grant before the report chapter. Never put a password in source, slides, or the handoff manifest.

After the 2026-09-25 Gate A recording, the finance-showcase and selected legacy accounts were rotated. The owner then set one shared password for all 38 synthetic demo Auth accounts and requested that it stay stable for now. The protected, ignored local files `.env.hosted-scenario-password.local` and `.env.hosted-operations-password.local` (mode 600) hold the same current value; `.env.local` supplies it to the legacy provisioning script. Use those files for future provisioning or recording so it does not change inadvertently. Never commit the value or put it in slides, recordings, or a handoff manifest. Raw login traces may contain entered credentials, so keep them protected.

## What the command records

The modular Playwright UAT chapters live in `tests/tornado/`. Each has a named trace step, a screenshot when its required screen is available, and a Chromium video. The native Playwright HTML, JSON, and JUnit reporters record pass/fail/skip, duration, and failure attachments. Paths are below `artifacts/tornado-demo/`:

| Path | Use |
| --- | --- |
| `screenshots/*.png` | Key-screen stills for slides |
| `videos-and-traces/` | Per-test browser videos, traces, and failure evidence |
| `html-report/index.html` | Human-readable UAT report |
| `results/uat.json`, `results/uat.xml` | Machine-readable UAT results |
| `results/preflight.json` | Target mode and credential-presence check; no secret values |

Generated artifacts are Git-ignored and may include private session data or credential values in trace actions. Share reviewed screenshots or edited video clips only. Keep raw traces and reports in protected storage.
Each successful preflight clears the previous generated screenshots and reports so the folder always describes one run. Save a protected copy before rerunning if you need the earlier evidence.

Playwright MCP / Agent CLI chapter annotation and cursor highlighting are not used (see the capture tool decision above) because the repository has a pinned native Playwright Test runner and no verified compatible export path for those features. Named `test.step` entries supply trace chapters; video, traces and screenshots are native Playwright outputs. The runner makes no claim that action highlights are burned into video.

## UAT scope

See [UAT definitions](docs/demo/TORNADO_RECORDING_UAT.md). The run checks visible pages and role denial, and optionally compares visible site count to the generated manifest. It does not prove receipt posting, contract activation, scenario replay, private media authorization, or live integration behavior. Run the controlled [Finance UAT](docs/demo/FINANCE_UAT.md) and [finance rehearsal](docs/demo/TORNADO_FINANCE_REHEARSAL.md) separately before calling the Finance MVP accepted.

For CI, configure `TORNADO_DEMO_PASSWORD` and `TORNADO_DEMO_ALLOWED_ORIGIN` as protected repository secrets. The allowed origin must exactly match the chosen HTTPS demo host. Provide the active manifest as a protected artifact or leave its check skipped. The manual GitHub Actions workflow installs Chromium, records the demo, and retains artifacts for seven days. Do not make this hosted run a required pull-request check without an isolated fixture environment.

## Presentation handoff

For an operator or presenter, start with the screenshot-led [Gate A finance training guide](docs/demo/GATE_A_FINANCE_TRAINING.md) and its [implemented finance process flows](docs/demo/GATE_A_FINANCE_PROCESS_FLOWS.md). The committed [screenshot inventory](docs/demo/assets/gate-a-finance/README.md) distinguishes the active seed from historical state-changing UAT images. Those public synthetic stills can be reviewed without opening protected Playwright traces.

Use [narration](docs/demo/TORNADO_NARRATION.md) and [slide map / Canva manifest](docs/demo/TORNADO_CANVA_HANDOFF.json). Review every still and UAT status before importing into Canva. Slides must retain the prototype/synthetic disclaimer. Generate the deck from successful screenshots; label skipped or failed chapters as unavailable rather than replacing them with invented screens. The source finance scenario may change, so refresh the expected manifest and screenshots immediately before external presentation.
