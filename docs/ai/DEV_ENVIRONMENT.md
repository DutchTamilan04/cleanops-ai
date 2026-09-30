# CleanOps/Tornado development environment

This repository is the CleanOps/Tornado development repository.

## Branch and deployment path

```text
feature branch/worktree
  -> pull request
  -> tornado-dev
  -> Vercel CleanOps/Tornado Dev deployment
  -> browser review
  -> intentional promotion to main
```

`main` is not the shared integration branch. `codex/ui-preview` is not used as the shared UI integration branch going forward.

## Repository boundary

- Development repository: `DutchTamilan04/cleanops-ai`
- Production repository: `Dutch-and-Digital/CleanOps-SAAS`

Do not modify the production repository from development tasks unless the task explicitly authorizes a production promotion or production-only operation.

## CI expectations

Pull requests run the full CI workflow. Direct pushes/merges to `tornado-dev` must also run CI so the integrated development branch has an independently verified status after merge.

## Vercel expectations

The Vercel development project must be connected to `DutchTamilan04/cleanops-ai` and configured so `tornado-dev` produces the shared online development deployment used for review. Production Vercel settings must remain separate.

For UI work, report the resulting Vercel Dev URL in the implementation handoff so Deepana can review the actual browser deployment before promotion.
