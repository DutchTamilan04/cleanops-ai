# Engineering Handoff Template

Use this structure in GitHub issues when Claude Code hands bounded implementation to Codex or another engineer.

```md
## Engineering Plan

### Architecture
Describe the existing architecture/pattern to reuse and any approved change.

### Files / Areas
- `src/...`
- `tests/...`

### Database
State whether a migration is required. List tables/RPCs/RLS implications.

### Security / Authorization
State required roles, tenant/site constraints, sensitive-data considerations and validation requirements.

### Sequence
1. ...
2. ...
3. ...

### Acceptance Criteria
- ...
- ...

### Tests
- unit:
- database:
- browser/E2E:

### Do Not
- do not create parallel domain models or duplicate services
- do not weaken RLS or client/server boundaries
- do not expand beyond issue scope without documenting the reason

### Handoff Notes
Known risks, dependencies, rollout or rollback notes.
```

The owning GitHub issue remains the implementation contract. If the plan conflicts with a newer explicit issue decision, update the issue/plan before implementation.