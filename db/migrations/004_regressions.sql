CREATE TABLE IF NOT EXISTS regression_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('lighthouse_lab', 'crux_field')),
  form_factor text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('page', 'origin')),
  direction text NOT NULL CHECK (direction IN ('higher_is_worse', 'lower_is_worse')),
  absolute_threshold numeric NOT NULL CHECK (absolute_threshold > 0),
  relative_threshold_percent numeric CHECK (relative_threshold_percent > 0),
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, metric_key, source, form_factor, scope)
);

CREATE TABLE IF NOT EXISTS regression_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  monitored_url_id uuid NOT NULL REFERENCES monitored_url(id) ON DELETE CASCADE,
  current_observation_id uuid NOT NULL REFERENCES metric_observation(id) ON DELETE CASCADE,
  previous_observation_id uuid NOT NULL REFERENCES metric_observation(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES regression_policy(id) ON DELETE SET NULL,
  metric_key text NOT NULL,
  source text NOT NULL,
  form_factor text NOT NULL,
  scope text NOT NULL,
  before_value numeric NOT NULL,
  after_value numeric NOT NULL,
  delta numeric NOT NULL,
  relative_change_percent numeric,
  severity text NOT NULL CHECK (severity IN ('moderate', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  UNIQUE (current_observation_id, previous_observation_id)
);

CREATE INDEX IF NOT EXISTS regression_project_detected_idx ON regression_event (project_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS regression_open_idx ON regression_event (project_id, status, detected_at DESC);

CREATE TABLE IF NOT EXISTS in_app_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  regression_event_id uuid NOT NULL UNIQUE REFERENCES regression_event(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS in_app_alert_org_idx ON in_app_alert (organization_id, read_at, created_at DESC);
