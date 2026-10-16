CREATE TABLE IF NOT EXISTS metric_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid NOT NULL REFERENCES audit_run(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  source text NOT NULL CHECK (source IN ('lighthouse_lab', 'crux_field')),
  form_factor text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('page', 'origin')),
  aggregation text NOT NULL CHECK (aggregation IN ('single_run', 'p75')),
  collection_start date,
  collection_end date,
  histogram jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_metric_name text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_run_id, metric_key, source, form_factor, scope, aggregation)
);

CREATE INDEX IF NOT EXISTS metric_observation_run_idx ON metric_observation (audit_run_id, source, metric_key);
CREATE INDEX IF NOT EXISTS metric_observation_series_idx ON metric_observation (metric_key, source, form_factor, scope, observed_at DESC);
