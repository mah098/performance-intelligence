CREATE TABLE IF NOT EXISTS audit_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_url_id uuid NOT NULL UNIQUE REFERENCES monitored_url(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  frequency_hours integer NOT NULL CHECK (frequency_hours IN (24, 168, 720)),
  strategy text NOT NULL CHECK (strategy IN ('mobile', 'desktop')),
  next_run_at timestamptz NOT NULL,
  last_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_schedule_due_idx ON audit_schedule (next_run_at) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS release_marker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  commit_sha text CHECK (commit_sha IS NULL OR commit_sha ~ '^[0-9a-fA-F]{7,40}$'),
  environment text CHECK (environment IS NULL OR char_length(environment) <= 80),
  released_at timestamptz NOT NULL,
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS release_marker_project_idx ON release_marker (project_id, released_at DESC);

CREATE TABLE IF NOT EXISTS release_audit_association (
  release_marker_id uuid NOT NULL REFERENCES release_marker(id) ON DELETE CASCADE,
  audit_run_id uuid NOT NULL REFERENCES audit_run(id) ON DELETE CASCADE,
  associated_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  associated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_marker_id, audit_run_id)
);
