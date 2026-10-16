CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_subject text NOT NULL UNIQUE,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  personal_owner_user_id uuid UNIQUE REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_membership (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS project_org_created_idx ON project (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS monitored_url (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  url text NOT NULL,
  canonical_url text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS monitored_url_project_created_idx ON monitored_url (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_url_id uuid NOT NULL REFERENCES monitored_url(id) ON DELETE CASCADE,
  requested_strategy text NOT NULL CHECK (requested_strategy IN ('mobile', 'desktop')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  request_source text NOT NULL DEFAULT 'manual' CHECK (request_source IN ('manual', 'schedule', 'release')),
  idempotency_key text NOT NULL,
  requested_url text NOT NULL,
  final_url text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  lighthouse_version text,
  psi_version jsonb,
  lab_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  lab_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_message text,
  UNIQUE (monitored_url_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS audit_url_completed_idx ON audit_run (monitored_url_id, completed_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS audit_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid NOT NULL UNIQUE REFERENCES audit_run(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_job_claim_idx ON audit_job (available_at, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS audit_job_lease_idx ON audit_job (lease_until) WHERE status = 'running';
