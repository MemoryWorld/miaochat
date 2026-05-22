CREATE TABLE workspace_provider_quota_periods (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  provider provider_id NOT NULL,
  quota_class text NOT NULL DEFAULT 'standard',
  period_started_at timestamptz NOT NULL,
  period_ends_at timestamptz NOT NULL,
  renews_at timestamptz NOT NULL,
  quota_limit integer NOT NULL,
  consumed_units integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_provider_quota_periods_window_check
    CHECK (period_ends_at > period_started_at),
  CONSTRAINT workspace_provider_quota_periods_scope_key
    UNIQUE (workspace_id, provider, quota_class, period_started_at)
);

CREATE INDEX workspace_provider_quota_periods_lookup_idx
  ON workspace_provider_quota_periods (
    workspace_id,
    provider,
    quota_class,
    period_started_at DESC
  );

CREATE INDEX workspace_provider_quota_periods_renewal_idx
  ON workspace_provider_quota_periods (renews_at);
