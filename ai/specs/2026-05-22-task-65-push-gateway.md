# Spec: Task 65 Mobile Push Notification Gateway

## Objective
Add a push-notification gateway that can deliver mobile notifications for:
- assigned-to-me events,
- approval requests,
- orchestrator failure escalations.

Delivery must stay workspace-aware and respect per-user notification
preferences.

## Assumptions
- A fake sender adapter is sufficient; CI does not need a real APNs/FCM
  backend.
- Preferences can be passed explicitly into the gateway rather than stored in a
  new database table in this slice.
- The mobile bridge only needs to normalize payloads for a future native push
  client.

## Commands
- Test: `pnpm --filter mobile test`
- Test: `pnpm test:integration`

## Project Structure
- `apps/api/src/modules/notifications/push-gateway.service.ts`
- `apps/mobile/src/notifications/push-bridge.ts`
- `tests/integration/push-notifications.spec.ts`

## Code Style
Keep the gateway deterministic and side-effect-light: evaluate preferences,
build a payload, and pass it to an injected sender.

## Testing Strategy
- Integration-test all three event types plus preference suppression.
- Unit-test the mobile bridge payload normalization through the existing mobile
  package test command.

## Boundaries
- Always: include workspace scope in the outgoing payload.
- Ask first: adding persistent notification preference storage.
- Never: deliver a push when the matching preference channel is disabled.

## Success Criteria
- Assigned, approval, and failure events each produce a push payload when
  enabled.
- Disabled preferences suppress delivery.
- The mobile bridge maps payloads into a stable client-facing shape.
