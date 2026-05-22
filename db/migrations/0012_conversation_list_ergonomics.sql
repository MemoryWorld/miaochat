ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS conversations_owner_pinned_updated_idx
  ON conversations (owner_user_id, workspace_id, is_pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS conversations_owner_archived_idx
  ON conversations (owner_user_id, workspace_id, archived_at)
  WHERE archived_at IS NOT NULL;

-- Postgres trigram extension is convenient for substring search, but we
-- avoid a hard dependency on it at this stage. A simple ILIKE on title
-- backed by a btree expression index is sufficient for Release 3.
CREATE INDEX IF NOT EXISTS conversations_title_lower_idx
  ON conversations (owner_user_id, workspace_id, lower(title));
