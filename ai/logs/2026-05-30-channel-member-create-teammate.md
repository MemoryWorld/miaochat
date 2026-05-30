# 2026-05-30 Channel Member Create Teammate

## Change
- Added a channel-scoped "新建同事" entry point in the channel members panel.
- Added `POST /conversations/:conversationId/teammates` so creating from a channel also binds the new AI coworker to that channel.
- Updated the teammate creation wizard to detect `channelId` and return to the current channel after creation.
- Wrapped the new teammate page in `Suspense` because `useSearchParams()` is required for channel-scoped creation.
- Rejected protocol-relative `returnTo` values and fall back to the current channel path.

## Reason
The channel detail page already shows who is in the current channel, but users had no direct way to add another AI coworker from that context. Creating from the generic teammate page also did not guarantee the coworker would be attached to the current conversation.

## Runtime Behavior
- From a channel, clicking `新建同事` opens `/teammates/new?channelId=...&returnTo=...`.
- Saving creates a DeepSeek-backed AI coworker through the server.
- The server inserts the coworker into `conversation_agents`, upgrades the conversation to `group` when needed, and returns the updated conversation.
- The web app redirects back to the original channel so the member list and timeline remain in the same workspace context.
- Unsafe external-looking return targets such as `//example.com/...` are ignored.

## Verification
- Added API coverage for creating and binding a new coworker to the current channel.
- Added UI coverage for the channel member entry point and channel-scoped creation submission.
- Reproduced and fixed the production build failure caused by `useSearchParams()` without a Suspense boundary.
