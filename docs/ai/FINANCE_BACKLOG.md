# Finance backlog reset

This development repository was copied without the historical GitHub issue backlog. The active Finance MVP work is therefore tracked locally from this point forward instead of relying on issue numbers from the transferred production repository.

The current source for implemented behavior remains code, migrations, tests and the canonical docs listed in `docs/INDEX.md`.

## Current order

1. Establish a fresh dev release/acceptance baseline against `tornado-dev` and the shared Vercel Dev deployment.
2. Define the customer onboarding/provisioning capability before broadening implementation.
3. Define customer accounting-source policy and mapping acceptance before any live Sage connector.
4. Fix the bounded direct-labour number-input defect with browser regression coverage.
5. Continue provider/pilot gates separately from already-implemented finance postings.

## Historical context

The transferred repository's historical Finance epic and Demo Data Factory remain useful background, but their old issue numbers are not valid task identifiers in this repository. Durable scenario rules live in `docs/demo/DATA_FACTORY.md`; current finance procedures live in `docs/finance/README.md` and related finance documentation.

Every new implementation must use a local GitHub issue in `DutchTamilan04/cleanops-ai` as its bounded task contract.
