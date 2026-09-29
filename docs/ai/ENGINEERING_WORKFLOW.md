# CleanOps AI Engineering Workflow

## Environments and branches
- `main`: reviewed production-ready branch in the development repository.
- `tornado-dev`: shared CleanOps/Tornado development and integration branch.
- feature branches: isolated work owned by one implementation agent at a time.

Examples:
- `claude/CLEAN-123-description`
- `codex/CLEAN-123-description`
- `fix/CLEAN-123-description`

All normal feature PRs target `tornado-dev`. `codex/ui-preview` is not the shared integration branch going forward.

## Release path
`feature branch -> tornado-dev -> Vercel CleanOps/Tornado Dev -> Deepana browser review -> adjustments -> reviewed promotion -> main`

No change should reach `main` accidentally or merely because CI is green. Promotion is intentional.

## Agent operating model
### Claude
Product / UX / requirements owner:
- requirements gathering
- user journeys
- information architecture
- UI/UX direction
- page hierarchy
- workflow design
- acceptance criteria
- edge cases
- design critique

### Claude Code
Principal Engineering Agent:
- architecture and system design
- complex frontend/backend architecture
- database/API design
- security, RLS and data-access implications
- dependency analysis
- complex debugging and refactors
- implementation planning
- difficult PR review

### Codex
Implementation / Testing Engineer:
- bounded GitHub issues
- approved components and UI patterns
- repetitive frontend conversions
- responsive/accessibility fixes
- test writing and regressions
- clearly specified migrations
- E2E/browser tests
- established service-pattern implementation

Codex should not redesign an approved architecture unless a concrete implementation problem requires a documented deviation.

### ChatGPT
Coordinator / Reviewer / Release Manager:
- inspect GitHub state
- recommend issue ownership
- coordinate sequencing and dependencies
- review PRs and CI
- check deployment status
- coordinate `tornado-dev -> main`
- keep product, architecture and implementation aligned

## Shared communication
Agents communicate through repository artifacts: GitHub issues, ADRs, design/architecture docs, implementation notes, branches, PRs, tests and CI.

Claude Code and Codex should not work on the same branch simultaneously. Use isolated branches/worktrees for substantial work.

## UI workflow
For large or ambiguous UI work:
1. Claude defines experience, hierarchy and acceptance criteria.
2. Claude Code defines frontend/component architecture and complex state boundaries.
3. Codex implements bounded work.
4. ChatGPT reviews CI/deployment and coordinates release.
5. Deepana reviews the online Vercel Dev UI.

Complex UI work may stay with Claude Code when architecture and implementation are too tightly coupled to split safely.

## Verification
Follow `AGENTS.md`. Application changes should run documented `typecheck`, `lint`, `test` and `build` checks; schema/auth changes need database isolation coverage; changed journeys need browser checks. Report skipped checks and why.

## Production boundary
`Dutch-and-Digital/CleanOps-SAAS` is the production environment and is outside this development workflow unless an explicit production promotion task is approved.