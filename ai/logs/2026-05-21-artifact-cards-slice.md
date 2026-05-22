# 2026-05-21 Artifact Cards Slice

## Scope

- Completed `Task 27`

## Changes

- Added `apps/web/src/features/artifacts/artifact-card.tsx` as a kind-aware
  router that picks the matching artifact card and includes the
  attachment-card fallback inline.
- Added `apps/web/src/features/artifacts/preview-card.tsx` for `image` and
  `preview` artifacts. The card surfaces the title, mime type, and a link to
  the previewable storage URL when one is present.
- Added `apps/web/src/features/artifacts/diff-card.tsx` as the baseline Diff
  card. It records the artifact metadata and storage key so a downstream
  iteration can replace it with a richer inline diff view without touching the
  surrounding chat thread layout.
- Added `apps/web/src/features/chat/chat-message.tsx` to wrap each message in
  the timeline and render attached artifacts beneath the body. Refactored
  `chat-thread.tsx` to take an `artifactsByMessageId` prop and delegate to
  `ChatMessage`.
- Updated `chat-experience.tsx` to fetch artifacts after each message reload
  and pass the resulting map down to the thread. Artifact fetch failures are
  swallowed so unrelated test paths still render without artifact data.
- Added `tests/e2e/artifact-cards.spec.tsx` that drives `HomePage` with a
  fake fetch returning preview, attachment, and diff artifacts and asserts
  that all three render with the correct accessibility labels and storage
  metadata.

## Verification

- `pnpm --filter web test` passed (6 tests).
- `pnpm test:e2e` passed (10 tests, including the new artifact-cards spec).

## Notes

- The diff card is intentionally minimal in this slice; an inline diff
  renderer (with before/after highlighting) is left for a later release.
- Artifact loading uses one fetch per message which is acceptable for the
  Release 1 timeline length; a batch endpoint can replace it without changing
  the consumer contract.
