ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thread_parent_message_id text REFERENCES messages(id) ON DELETE CASCADE;

ALTER TABLE channel_user_memberships
  ADD COLUMN IF NOT EXISTS last_read_message_id text REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_preference text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  ALTER TABLE channel_user_memberships
    ADD CONSTRAINT channel_user_memberships_notification_preference_check
    CHECK (notification_preference IN ('all', 'mentions_only', 'muted'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS message_reactions (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_emoji_check
    CHECK (length(trim(emoji)) BETWEEN 1 AND 8)
);

CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_unique_user_emoji_idx
  ON message_reactions (message_id, user_id, emoji);

CREATE INDEX IF NOT EXISTS messages_thread_parent_idx
  ON messages (workspace_id, owner_user_id, conversation_id, thread_parent_message_id, created_at);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx
  ON message_reactions (message_id, created_at);

CREATE INDEX IF NOT EXISTS channel_user_memberships_read_state_idx
  ON channel_user_memberships (
    workspace_owner_user_id,
    workspace_id,
    channel_id,
    user_id,
    last_read_at
  )
  WHERE user_id IS NOT NULL AND removed_at IS NULL;

INSERT INTO channel_user_memberships (
  id,
  channel_id,
  workspace_id,
  workspace_owner_user_id,
  user_id,
  role,
  permission,
  status,
  invited_by_user_id,
  joined_at
)
SELECT
  'channel-owner:' || conversations.id || ':' || conversations.owner_user_id,
  conversations.id,
  conversations.workspace_id,
  conversations.owner_user_id,
  conversations.owner_user_id,
  'owner',
  'manage',
  'active',
  conversations.owner_user_id,
  conversations.created_at
FROM conversations
INNER JOIN users AS conversation_owners
  ON conversation_owners.id = conversations.owner_user_id
ON CONFLICT DO NOTHING;
