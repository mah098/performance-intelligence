CREATE UNIQUE INDEX IF NOT EXISTS github_issue_submission_fingerprint_idx
  ON github_issue_outcome (organization_id, regression_event_id, repository_id, title, body_sha256);
