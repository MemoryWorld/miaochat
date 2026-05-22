CREATE TABLE credential_pool_entries (
  id text PRIMARY KEY,
  provider provider_id NOT NULL,
  region text NOT NULL,
  tier text NOT NULL,
  quota_class text NOT NULL,
  credential_source credential_source NOT NULL DEFAULT 'platform_managed',
  label text NOT NULL,
  provider_account_id text NOT NULL,
  encrypted_secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_pool_entries_platform_managed_only
    CHECK (credential_source = 'platform_managed')
);

CREATE UNIQUE INDEX credential_pool_entries_provider_account_scope_key
  ON credential_pool_entries (provider, region, tier, quota_class, provider_account_id);

CREATE INDEX credential_pool_entries_lookup_idx
  ON credential_pool_entries (provider, region, tier, quota_class, is_active, created_at, id);
