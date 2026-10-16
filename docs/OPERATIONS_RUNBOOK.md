# Operations runbook

This project ships a container image that can run the web process, audit worker, scheduler, or optional AI worker. It does not assume a hosting provider. Run the same image revision for every process and put PostgreSQL on a private network.

## Required deployment configuration

- Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and the production `APP_BASE_URL` through the host secret manager. Add `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` only if GitHub sign-in remains enabled as an alternative.
- Add `PAGESPEED_API_KEY` and optionally `CRUX_API_KEY`. Restrict provider keys to the APIs and environment that need them.
- Set the GitHub App client ID/secret and `GITHUB_TOKEN_ENCRYPTION_KEY` only if issue creation is enabled. The key must be base64-encoded 32 bytes; rotate it only with a planned decrypt-and-reencrypt operation.
- Set `OPENAI_API_KEY` and `OPENAI_MODEL` only if evidence-grounded analysis is enabled. Without them, the audit and regression workflows remain available.
- Set the GitHub App callback URL to `${APP_BASE_URL}/api/github/callback`; configure repository Issues write and metadata read only.
- Set `APP_BASE_URL` to the public HTTPS origin so OAuth redirects and issue links point back to the deployment.

## Build and process layout

Build the image from the repository root with `docker build -t pulseboard:<revision> .`. Run four separate processes from that exact image when all features are enabled:

| Process | Container command | Public ingress |
|---|---|---|
| Web | Default `node server.js` | Yes, port 3000 behind TLS termination |
| Audit worker | `npm run worker` | No |
| Scheduler | `npm run scheduler` | No |
| Analysis worker | `npm run analysis-worker` | No; optional |

Before deploying a new web revision, run `npm run db:migrate` once as a controlled job using the same image and database. Do not run migrations independently from every replica. Keep backups available before schema changes.

## Health and rollback

- Use `GET /api/health` for web/database readiness. It returns no secrets.
- Watch process logs for `audit.*`, `schedule.*`, `analysis.*`, and worker startup/shutdown events. Logs contain internal IDs and error classes, not provider payloads or authorization headers.
- A worker can be restarted without losing queued work. Leases allow a later worker to reclaim expired jobs; review queue age and repeated terminal failures after restart.
- Roll back web and worker containers together to the previous image. Migrations are additive in this release series; do not automatically reverse a migration after data has been written.

## Database backup and restore

- Enable encrypted automated PostgreSQL backups with point-in-time recovery on the managed database service. Keep backups in a separate account/project with access logging.
- Before a production migration, create a custom-format logical backup using the database service’s secret injection (do not put the connection string in shell history): `pg_dump --format=custom --no-owner --file=pulseboard-before-migration.dump "$DATABASE_URL"`.
- Restore into an isolated database with `pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" pulseboard-before-migration.dump`, apply migrations, then verify health, URL counts, recent audit counts, and a sample regression/alert before switching traffic.
- Perform and record a restore drill before public launch and on a regular schedule. A backup without a successful restore is not a verified recovery plan.

## Limits and data lifecycle

- Tenant rate limits cap URL creation at 20/hour, manual audit enqueue at 10/hour, AI analysis at 5/hour, GitHub issue creation at 10/hour, GitHub connect at 5/hour, release marker creation at 20/hour, and schedule changes at 30/hour. Scheduled work is deferred when an organization has 20 queued/running audits.
- The app does not automatically delete audit history or evidence. Decide retention, export, and account deletion requirements before onboarding real users; apply deletion only after verifying backup retention and provider-sharing obligations.
- CrUX is a rolling 28-day window; snapshots overlap. Explain the window in product UI and avoid treating adjacent snapshots as independent samples.

## Provider incidents

- PageSpeed and CrUX failures do not delete prior measurements. Failed audit runs do not become regression baselines.
- If GitHub issue creation reports an ambiguous outcome, inspect the repository before retrying; the outcome record prevents replay of the same submitted draft.
- Disable optional AI by removing `OPENAI_API_KEY` or stopping the analysis worker. Deterministic regression status remains available.
- Pause scheduled monitoring by disabling schedules in the URL history page. For an emergency, stop the scheduler process; already queued audits remain durable.
