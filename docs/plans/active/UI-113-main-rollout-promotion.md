# UI-113: Selective rollout promotion to main

This draft promotion assembles the focused preview changes from PRs #144–#151
on current `main` after the earlier design-system promotion #143. The source
preview PRs remain subject to their independent review and merge gate. The
promotion PR must stay draft until that gate is complete.

## Main behavior retained

- Equipment asset tags remain links to the newer `/equipment/[id]` route.
- The equipment intake boundary retains `main`'s wording that repair
  completion requires separate attributed maintenance actions and approval.
- Finance contract and reconciliation section tabs use the newer access-aware
  `getFinanceSectionTabs(access)` signature from `main`.
- No services, server actions, schemas, database migrations or generated
  scenarios are changed by this promotion.

The conflict resolutions combine distinct CSS rules from the preview slices.
An additional file-input width rule fixes overflow at 390px on the contract
review page. The E2E Client receives its own synthetic membership, preserving
the seeded Client identity needed by the development demo adapter.

## Verification

- [x] Typecheck, lint, 108 unit tests and production build pass locally.
- [x] Full authenticated Playwright run on the current local schema: 34 passed,
  one finance scenario generator case skipped because its separate generated
  fixture was not prepared.
- [x] Director and Area Manager contract mobile review width checks pass.
- [x] Supervisor/Client report release and redaction checks pass in production
  browser mode; the Client fixture correction also passes in CI-style dev mode.
- [ ] Preview source PRs have independent approval and are merged.
- [ ] Promotion PR required checks pass and it receives independent approval.
- [ ] After merge, hosted role checks and release state are recorded separately.
