CREATE TABLE IF NOT EXISTS regression_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regression_event_id uuid NOT NULL UNIQUE REFERENCES regression_event(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  request_input jsonb NOT NULL,
  result jsonb,
  provider text NOT NULL DEFAULT 'openai',
  model text,
  schema_version text NOT NULL DEFAULT '1',
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS regression_analysis_queue_idx ON regression_analysis (updated_at) WHERE status IN ('queued', 'running');
