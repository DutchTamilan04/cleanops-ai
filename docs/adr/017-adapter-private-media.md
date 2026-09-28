# ADR 017: private signed adapter image uploads

Status: accepted, 2026-09-28. Scope: CLEAN-014A / issue #162.

## Context

The signed generic event adapter accepted text and rejected media. Fetching caller URLs
would allow server-side request forgery and passing base64 through the app function
would expand its payload and logging exposure. CleanOps already has a private
`operational-evidence` bucket and an evidence state machine that verifies image bytes.

## Decision

The signed adapter accepts image metadata only: a provider media ID, JPEG/PNG/WebP
MIME, size up to 10 MiB and SHA-256. It persists the text event and a leased job
before returning `202`. Once normalized, a database trigger stages one scoped
`task_evidence` row per declared image and links it to the adapter job. A signed
caller with the same credential requests a path-scoped Supabase upload token, uploads
bytes directly to the private bucket, then signs a separate finalize command.
Finalization downloads the private object server-side and compares its sniffed
type, size and digest to the declared metadata before the existing evidence RPC
can make it ready. The app never downloads a caller-selected URL or accepts media
base64 in the event body.

Supabase signed upload tokens are valid for two hours. A token is scoped to a
single unique private path with overwrite disabled. An expired or absent upload
becomes `missing`; unsafe bytes become `quarantined`. A signed retry rotates the
path so an old token cannot write the new evidence target. The original text
message and delivery ledger remain available throughout. A protected worker
sweep records timeouts for abandoned staged uploads.

## Consequences and limits

- This slice supports images for cleaning evidence; documents, video and audio
  need a separately reviewed media pipeline.
- A signed upload token can still write to its old path until its two-hour
  Supabase expiry, even after a retry. The old path is no longer referenced by
  the evidence row and remains private; object cleanup is an operator task.
- Successful normalization is not image verification, task linkage, quality
  approval or client release. Those gates remain separate.
- Local database and mocked storage tests do not establish a live WhatsApp
  media channel or a hosted browser upload; issue closure needs that evidence.

Revisit if Supabase offers caller-controlled upload-token TTL or a provider
supplies an authenticated, allowlisted media downloader with stronger revocation.
