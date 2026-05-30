ALTER TABLE provider_credentials
  ADD COLUMN IF NOT EXISTS model_connection_preset text;
