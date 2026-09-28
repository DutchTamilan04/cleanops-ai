# CleanOps AI

CleanOps is a role- and site-scoped operations and finance application for cleaning teams in casinos and other continuous-service facilities. This repository contains a running Next.js application, Supabase migrations and tests, synthetic scenario tooling, and browser UAT. The highest-priority product track is **Tornado operational finance** ([issue #61](https://github.com/niru2015/cleanops-ai/issues/61)).

**Reviewed baseline:** `main` at `7d16984` on 2026-09-28. Code and migrations establish implemented behavior; a merged branch, passing CI or a synthetic demo does not establish a customer production pilot. Demo people and transactions are synthetic. Reference casino/equipment names follow [ADR 008](docs/adr/008-real-casino-names-public-repo.md) and do not assert a customer relationship.

## Where to start

| Need | Guide |
| --- | --- |
| New customer finance setup and role training | [Finance operator and customer training](docs/finance/README.md) → [new customer runbook](docs/finance/NEW_CUSTOMER_SETUP.md) |
| Implemented roadmap and live issue review | [Roadmap and release gates](docs/plans/ROADMAP.md) |
| Agent/developer context | [AGENTS.md](AGENTS.md) → [documentation index](docs/INDEX.md) |
| Synthetic Gate A presenter/UAT evidence | [Gate A finance training](docs/demo/GATE_A_FINANCE_TRAINING.md), [finance UAT](docs/demo/FINANCE_UAT.md), [Tornado recorder](TORNADO_DEMO.md) |
| Data and authorization details | [Data mapping](docs/DATA_MAPPING.md), [dictionary](docs/DATA_DICTIONARY.md), [process flows](docs/PROCESS_FLOWS.md), [security](docs/SECURITY.md) |

## What is implemented on `main`

| Area | Current application path | Boundary |
| --- | --- | --- |
| Identity and site access | `/login`; active membership and site-grant checks | No self-service customer tenant setup or multi-organization selector. |
| Casino operations | `/operations`, `/mobile`, `/review` | Staffing/coverage, task evidence, Mock AI suggestion and explicit human review; selected walkthrough data remains synthetic. |
| Incidents and reporting | `/incidents`, `/reports`, `/reports/client` | Neutral incident/equipment intake and explicitly released, redacted client report. |
| Finance intake | `/mobile/expenses`, `/finance/inbox`, `/finance/expenses` | Private receipt, advisory extraction, human resolution and Director-only posting. |
| Contract to expected revenue | `/finance/contracts`, `/finance/contracts/new`, contract review | Manual or private document draft, human clause decisions, Director approval/activation, version-linked future obligations. |
| Time, rates and projects | `/finance/time`, `/finance/rates`, `/finance/projects` | Operational time review, Director-only effective rates/cost posting and source-linked one-off contribution. |
| Accounting and management | `/finance`, `/finance/reconciliation` | Manual CSV preview/acceptance, matching and period close; source-backed site comparison and human review prompts. No live Sage sync. |
| Supplies and equipment care | `/supplies`, `/equipment`, `/equipment/[id]` | Request/approval/stock history, inspections, maintenance and links to **existing** approved expense postings. |
| Synthetic demo | `demo:generate`, `demo:assert`, `demo:tornado` | Protected scenario/replay and recorded UAT; not a customer-data import or live provider proof. |

Official WhatsApp and Make adapter code exists, but live customer transport and existing-group access require separate provider/pilot verification. Open gaps and deferred media work are tracked in the [roadmap](docs/plans/ROADMAP.md#outstanding-issue-and-release-gates).

## Local development and verification

Use Node.js 24.14.0 (`.nvmrc`), npm 11.9.0 and a Docker-compatible runtime for local Supabase.

```bash
npm ci
cp .env.example .env.local
npm run db:start
npm run db:reset
npm run dev
```

After `db:start`, copy the local publishable key shown by `npm run db:status` into `.env.local`. Keep secret/service-role keys server-side. Synthetic demo ingress is off unless explicitly enabled in a local environment; see [WhatsApp integration](docs/integrations/WHATSAPP.md). Do not point local reset or scenario commands at a customer database.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:db
npm run test:e2e
```

`npm run test:db:postgres` is the documented PostgreSQL 17+ compatibility fallback when a Docker runtime is unavailable. `npm run demo:tornado` writes browser results under `artifacts/tornado-demo/`; authenticated runs need the protected synthetic credentials described in [TORNADO_DEMO.md](TORNADO_DEMO.md). Run `demo:generate`/`demo:assert` only against an explicitly selected synthetic scenario and read [DATA_FACTORY](docs/demo/DATA_FACTORY.md) before any reset.

## Source and release rules

Main branch code, migrations and tests are the implementation source. [Finance issue #61](https://github.com/niru2015/cleanops-ai/issues/61) and [scenario issue #28](https://github.com/niru2015/cleanops-ai/issues/28) define the business contracts; older phase prose is historical. Keep operational postings separate from accepted accounting actuals, never call direct contribution net profit, and never turn AI output or a message into an approval. Require organization **and** site authorization for reads and writes.

Review one bounded change at a time. For a changed data path, update the corresponding mapping, dictionary and process-flow documentation in the same PR. Keep local tests, CI, deployed browser evidence and customer acceptance distinct. The repository is public by owner decision; never commit customer records, passwords, tokens or raw private media.
