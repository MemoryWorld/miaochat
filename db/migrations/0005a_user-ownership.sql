ALTER TABLE custom_agents
  ADD COLUMN IF NOT EXISTS owner_user_id text;

UPDATE custom_agents
SET owner_user_id = COALESCE(owner_user_id, 'system-user');

ALTER TABLE custom_agents
  ALTER COLUMN owner_user_id SET NOT NULL;

DROP INDEX IF EXISTS custom_agents_workspace_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS custom_agents_owner_workspace_name_key
  ON custom_agents (owner_user_id, workspace_id, name);

CREATE INDEX IF NOT EXISTS custom_agents_owner_workspace_created_at_idx
  ON custom_agents (owner_user_id, workspace_id, created_at DESC, id DESC);

ALTER TABLE provider_credentials
  ADD COLUMN IF NOT EXISTS owner_user_id text;

UPDATE provider_credentials
SET owner_user_id = COALESCE(owner_user_id, 'system-user');

ALTER TABLE provider_credentials
  ALTER COLUMN owner_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS provider_credentials_owner_workspace_created_at_idx
  ON provider_credentials (owner_user_id, workspace_id, created_at ASC, id ASC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS owner_user_id text;

UPDATE messages
SET owner_user_id = COALESCE(
  messages.owner_user_id,
  conversations.owner_user_id,
  'system-user'
)
FROM conversations
WHERE conversations.id = messages.conversation_id
  AND conversations.workspace_id = messages.workspace_id;

ALTER TABLE messages
  ALTER COLUMN owner_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS messages_owner_workspace_conversation_created_at_idx
  ON messages (owner_user_id, workspace_id, conversation_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS conversations_owner_workspace_updated_at_idx
  ON conversations (owner_user_id, workspace_id, updated_at DESC, id DESC);
