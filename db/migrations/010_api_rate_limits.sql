CREATE TABLE IF NOT EXISTS api_rate_limit_bucket (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, action, window_started_at)
);

CREATE INDEX IF NOT EXISTS api_rate_limit_expiry_idx ON api_rate_limit_bucket (window_started_at);
