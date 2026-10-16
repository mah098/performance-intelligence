CREATE TABLE IF NOT EXISTS github_oauth_state (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS github_oauth_state_expiry_idx ON github_oauth_state (expires_at);

CREATE TABLE IF NOT EXISTS github_connection (
  organization_id uuid PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  connected_by uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  encrypted_token_bundle text NOT NULL,
  encryption_iv text NOT NULL,
  encryption_tag text NOT NULL,
  key_version text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  github_user_id bigint NOT NULL,
  github_login text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_issue_outcome (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  regression_event_id uuid NOT NULL REFERENCES regression_event(id) ON DELETE CASCADE,
  recommendation_index integer NOT NULL CHECK (recommendation_index >= 0),
  idempotency_key uuid NOT NULL,
  repository_id bigint NOT NULL,
  repository_full_name text NOT NULL,
  title text NOT NULL,
  body_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'unknown')),
  issue_number integer,
  issue_url text,
  error_code text,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS github_issue_event_idx ON github_issue_outcome (regression_event_id, created_at DESC);
