ALTER TABLE regression_event
  ADD COLUMN IF NOT EXISTS policy_version integer NOT NULL DEFAULT 1;
