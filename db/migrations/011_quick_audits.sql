CREATE TABLE IF NOT EXISTS public_audit_rate_limit (
  client_fingerprint text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_fingerprint, window_started_at)
);

CREATE TABLE IF NOT EXISTS guest_audit_access (
  audit_run_id uuid PRIMARY KEY REFERENCES audit_run(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  token_sha256 text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_audit_access_expiry_idx ON guest_audit_access (expires_at);
