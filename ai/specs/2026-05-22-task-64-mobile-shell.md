# Spec: Task 64 Mobile Shell

## Objective
Create a minimal mobile package that models the read-and-approve experience:
- browse conversations,
- open a conversation thread,
- approve or reject approval cards,
- preview attachments in a lightweight mobile-friendly shell.

## Assumptions
- A React-based mobile shell abstraction is sufficient for CI; we do not need a
  real Expo runtime in this slice.
- Approval actions can be modeled as callback-driven cards.
- Attachment preview means rendering lightweight links or inline image previews,
  not editing content.

## Commands
- Test: `pnpm --filter mobile test`

## Project Structure
- `apps/mobile/src/screens/conversation-list.tsx`
- `apps/mobile/src/screens/conversation-thread.tsx`
- `apps/mobile/src/components/approval-card.tsx`
- `apps/mobile/test/approval-card.spec.tsx`

## Code Style
Keep components small and declarative. Prefer prop-driven rendering over
navigation frameworks or native-specific abstractions.

## Testing Strategy
- Verify the approval card exposes approve/reject actions.
- Verify the conversation list renders browseable entries.
- Verify the thread screen renders attachment previews and approval cards.

## Boundaries
- Always: keep mobile flows read-oriented.
- Ask first: introducing native device permissions or push integrations.
- Never: add heavy editing or desktop-only artifact mutation to the mobile shell.

## Success Criteria
- `pnpm --filter mobile test` passes.
- The conversation list renders a compact browseable list.
- The thread screen renders approval cards and attachment previews.
- Approve/reject actions surface through callbacks.
