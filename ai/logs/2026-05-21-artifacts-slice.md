# 2026-05-21 Artifacts Slice

## Scope

- Completed `Task 26`

## Changes

- Extended the shared artifact contracts so the platform now has typed schemas for artifact creation, artifact queries, and presigned upload-target responses in addition to the stored artifact record shape.
- Added an `ArtifactsModule` in the API with a controller surface for `POST /artifacts/upload-target`, `POST /artifacts`, and `GET /artifacts`.
- Implemented `StorageService` as the server-side attachment hook for S3-compatible storage, using configured server credentials to generate presigned `PUT` upload targets instead of exposing raw storage secrets to the browser.
- Implemented `ArtifactsService` to validate message ownership by workspace, persist artifact metadata linked to a message, and return artifacts in message timeline order.
- Added `0004_artifacts.sql` with artifacts read-path indexes so message-scoped artifact lookups stay cheap as attachment volume grows.
- Added integration coverage that creates a conversation and message, prepares an attachment upload target, persists the artifact metadata, and lists the artifact back by message.

## Verification

- `pnpm --filter @agenthub/contracts test` passed.
- `pnpm test:integration` passed.

## Notes

- The current slice prepares upload targets and persists metadata only; actual object upload execution and preview rendering remain later concerns.
- Attachment upload targets currently use presigned `PUT` URLs with path-style S3 addressing so the local MinIO development path stays compatible.
