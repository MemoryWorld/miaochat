CREATE TABLE IF NOT EXISTS artifact_revisions (
  id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  revision_index integer NOT NULL,
  parent_revision_id text REFERENCES artifact_revisions(id) ON DELETE SET NULL,
  author_user_id text REFERENCES users(id) ON DELETE SET NULL,
  /**
   * Snapshot of the artifact contents at the time the revision was created.
   * Storage of large blobs is delegated to S3-compatible storage; this table
   * keeps the metadata + a `content_digest` (sha256) so consumers can verify
   * what they downloaded from the storage layer matches the recorded revision.
   */
  content_digest text NOT NULL,
  preview_url text,
  storage_key text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, revision_index)
);

CREATE INDEX IF NOT EXISTS artifact_revisions_artifact_idx
  ON artifact_revisions (artifact_id, revision_index DESC);

CREATE INDEX IF NOT EXISTS artifact_revisions_workspace_idx
  ON artifact_revisions (workspace_id, created_at DESC);
