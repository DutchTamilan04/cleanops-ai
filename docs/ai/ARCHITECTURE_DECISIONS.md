# AI Architecture Decisions

This file is a lightweight index for decisions that affect agent implementation. Canonical architectural decisions remain in `docs/adr/`.

## Rules
- Do not duplicate ADR content here.
- Link the relevant ADR or issue when an agent plan depends on it.
- New architectural decisions require a short ADR in `docs/adr/`.
- Existing services and data paths should be reused unless a reviewed issue explicitly approves replacement.
- Security, RLS, tenant/site isolation and financial-data integrity decisions must be called out before implementation.

## Active workflow decisions
- `AGENTS.md` is the authoritative shared engineering policy.
- Claude owns product/UX direction.
- Claude Code owns complex engineering architecture.
- Codex owns bounded implementation/testing.
- ChatGPT coordinates review and release flow.
- Feature work targets `tornado-dev`.
- `codex/ui-preview` is not the shared integration branch.
- Production promotion is separate and intentional.