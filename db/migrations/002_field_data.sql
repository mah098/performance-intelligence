ALTER TABLE audit_run
  ADD COLUMN IF NOT EXISTS field_data_status text NOT NULL DEFAULT 'not_configured'
    CHECK (field_data_status IN ('available', 'no_data', 'not_configured', 'unavailable')),
  ADD COLUMN IF NOT EXISTS field_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS audit_field_data_status_idx ON audit_run (field_data_status, completed_at DESC);
