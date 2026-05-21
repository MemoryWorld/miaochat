DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artifact_kind') THEN
    CREATE TYPE artifact_kind AS ENUM ('attachment', 'diff', 'image', 'preview');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_mode') THEN
    CREATE TYPE conversation_mode AS ENUM ('direct', 'group');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credential_source') THEN
    CREATE TYPE credential_source AS ENUM ('platform_managed', 'user_provided');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
    CREATE TYPE message_role AS ENUM ('assistant', 'system', 'user');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_id') THEN
    CREATE TYPE provider_id AS ENUM ('claude-code', 'codex', 'hermes', 'mock', 'openclaw');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  mode conversation_mode NOT NULL,
  owner_user_id text NOT NULL,
  pinned_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  title text NOT NULL,
  workspace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_agents (
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  agent_name text NOT NULL,
  workspace_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content text NOT NULL,
  source_agent_id text,
  is_pinned boolean NOT NULL DEFAULT false,
  workspace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  id text PRIMARY KEY,
  credential_source credential_source NOT NULL,
  encrypted_secret text NOT NULL,
  label text NOT NULL,
  provider provider_id NOT NULL,
  provider_account_id text NOT NULL,
  validation_state text NOT NULL,
  workspace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_agents (
  id text PRIMARY KEY,
  avatar_url text,
  capability_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  name text NOT NULL,
  provider provider_id NOT NULL,
  system_prompt text NOT NULL,
  tool_bindings jsonb NOT NULL DEFAULT '[]'::jsonb,
  workspace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind artifact_kind NOT NULL,
  title text NOT NULL,
  mime_type text NOT NULL,
  preview_url text,
  storage_key text,
  workspace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
