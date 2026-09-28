# ADR 016: verified cross-transport WhatsApp message identity

Status: accepted, 2026-09-28. Scope: CLEAN-014C / issue #164.

## Context

Meta and Make authenticate separately but both use the same registered Cloud API phone
account. The signed generic adapter uses an `event_adapter` account. A shared message
ID across those accounts was previously two normalized messages and could create two
draft finance or operations records.

## Decision

An operator may create one service-only `integration_adapter_canonical_bindings` row
only after verifying that the adapter's `source=whatsapp` means the same enabled Cloud
API phone number, organization and site. The exact provider phone ID must be the
`external_account_id` on both accounts. The row records a verification reference.
Binding an adapter account with existing normalized messages is refused until those
rows are reconciled in a separate reviewed migration.

Normalization maps a bound adapter message to the Cloud API account before the
existing `(integration_account_id, external_message_id)` uniqueness check. An atomic
completion trigger compares thread, sender, occurrence time, text, media references
and schema version with the first row, then links each accepted event in the private
`integration_message_deliveries` ledger. Meta, Make and signed adapter transport
names are recorded at acceptance. A different body under the same verified identity
fails the job with `logical_message_conflict` and keeps the original row and draft.
Unbound generic sources keep their own account namespace.

## Consequences and limits

- Provider message IDs, not matching text or media hashes, are the identity.
- Retries of the same adapter message return the original event/job. The ledger
  records distinct accepted events, not every HTTP retry attempt.
- The binding is an operator verification claim, not proof that WhatsApp sent an
  adapter payload. Keep the HMAC key restricted to its registered account/source.
- A client without a provider message ID cannot be merged across transports;
  fallback event IDs remain distinct and must be reviewed.
- Media transport is still governed by CLEAN-014A; no new attachment capability
  is implied here.

Revisit if a provider exposes signed canonical identity across multiple phone
accounts or if a customer requires audited alias rekeying of historical messages.
