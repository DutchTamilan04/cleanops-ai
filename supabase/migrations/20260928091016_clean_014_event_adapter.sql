-- Keep the enum addition in its own migration: PostgreSQL cannot use a new
-- enum value in the transaction that introduces it.
alter type public.integration_provider add value if not exists 'event_adapter';
