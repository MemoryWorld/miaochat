CREATE TABLE IF NOT EXISTS auth_login_audit_events (
  id text PRIMARY KEY,
  email text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  ip_address text NOT NULL,
  outcome text NOT NULL,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_audit_events_email_created_at_idx
  ON auth_login_audit_events (email, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_login_audit_events_user_created_at_idx
  ON auth_login_audit_events (user_id, created_at DESC);
