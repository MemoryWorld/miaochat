ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS author_user_id text,
  ADD COLUMN IF NOT EXISTS mentioned_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS channel_user_memberships (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  workspace_owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  invited_email text,
  workspace_invitation_id text,
  role text NOT NULL DEFAULT 'member',
  permission text NOT NULL DEFAULT 'comment',
  status text NOT NULL DEFAULT 'active',
  invited_by_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_user_memberships_identity_check
    CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL),
  CONSTRAINT channel_user_memberships_permission_check
    CHECK (permission IN ('read', 'comment', 'manage')),
  CONSTRAINT channel_user_memberships_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  CONSTRAINT channel_user_memberships_status_check
    CHECK (status IN ('active', 'pending', 'disabled', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_user_memberships_active_user_idx
  ON channel_user_memberships (
    workspace_owner_user_id,
    workspace_id,
    channel_id,
    user_id
  )
  WHERE user_id IS NOT NULL AND removed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channel_user_memberships_pending_email_idx
  ON channel_user_memberships (
    workspace_owner_user_id,
    workspace_id,
    channel_id,
    lower(invited_email)
  )
  WHERE invited_email IS NOT NULL AND removed_at IS NULL;

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
  'channel-share:' || conversation_shares.conversation_id || ':' || conversation_shares.shared_with_user_id,
  conversation_shares.conversation_id,
  conversation_shares.workspace_id,
  conversation_shares.workspace_owner_user_id,
  conversation_shares.shared_with_user_id,
  CASE
    WHEN conversation_shares.permission = 'read' THEN 'guest'
    ELSE 'member'
  END,
  conversation_shares.permission,
  'active',
  conversation_shares.created_by_user_id,
  conversation_shares.created_at
FROM conversation_shares
INNER JOIN users AS shared_users
  ON shared_users.id = conversation_shares.shared_with_user_id
INNER JOIN users AS share_owners
  ON share_owners.id = conversation_shares.workspace_owner_user_id
ON CONFLICT DO NOTHING;
