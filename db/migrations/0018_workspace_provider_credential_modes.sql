CREATE TABLE workspace_provider_credential_modes (
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  provider provider_id NOT NULL,
  credential_source credential_source NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_provider_credential_modes_pkey
    PRIMARY KEY (owner_user_id, workspace_id, provider),
  CONSTRAINT workspace_provider_credential_modes_workspace_fk
    FOREIGN KEY (owner_user_id, workspace_id)
    REFERENCES workspaces (owner_user_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_provider_credential_modes_platform_only
    CHECK (credential_source = 'platform_managed')
);

CREATE INDEX workspace_provider_credential_modes_lookup_idx
  ON workspace_provider_credential_modes (owner_user_id, workspace_id, created_at);
