# Pulseboard · Web Performance Intelligence

An evidence-first workspace for auditing public web pages, tracking performance history, and investigating regressions. The implemented product includes Google sign-in, optional GitHub sign-in for existing accounts, URL management, durable Lighthouse audits, optional CrUX field data, bounded trends, configurable regression alerts, scheduled audits, release markers, optional evidence-grounded analysis, and reviewed GitHub issue creation. Deployment validation and several production-readiness gates remain; see the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Requirements

- Node.js 20.9 or newer (Node 24+ recommended).
- Docker Compose for the local PostgreSQL service, or a PostgreSQL 15+ database.
- A Google OAuth web client for sign-in. Configure `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` with the authorized redirect URI `http://localhost:3000/api/auth/callback/google` for local development.
- A Google PageSpeed Insights API key to run real Lighthouse audits.

GitHub sign-in remains available as an alternative for existing accounts. It does not grant repository access. The optional GitHub App authorization used to create issues is a separate connection. Configure the GitHub App with a callback URL of `http://localhost:3000/api/github/callback` during local development, repository `Issues: write` permission, and metadata read. Set `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, a base64-encoded 32-byte `GITHUB_TOKEN_ENCRYPTION_KEY`, and `APP_BASE_URL`. Install the App on the repositories the user should be able to select. In production, store the encryption key in a managed secret manager and set the exact public HTTPS base URL.

## Local setup

1. Install dependencies: `npm install`.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Copy `.env.example` to `.env.local` and set a random `AUTH_SECRET` (at least 32 characters), Google OAuth client ID/secret, and `PAGESPEED_API_KEY`.
4. In Google Cloud Console, create a Web application OAuth client and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Put its client ID and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
5. Apply migrations: `npm run db:migrate`.
6. Start the web process: `npm run dev`.
7. In a second terminal, start the audit worker: `npm run worker`.
8. In a third terminal, start the scheduler: `npm run scheduler`.
9. Optionally configure `OPENAI_API_KEY` and `OPENAI_MODEL`, then start `npm run analysis-worker` in another terminal to enable regression explanations.
10. Open `http://localhost:3000`. You can run a one-time mobile or desktop audit from the login page without signing in, or continue with Google to save history and monitor URLs. GitHub sign-in remains available for existing GitHub-linked accounts.

If no PageSpeed key is configured, audit jobs transition to a visible provider configuration error. The product does not create sample or fabricated measurements.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js app. |
| `npm run worker` | Poll and process durable audit jobs. |
| `npm run worker:once` | Process at most one queued audit and exit. |
| `npm run scheduler` | Poll PostgreSQL for due scheduled audits. |
| `npm run scheduler:once` | Enqueue at most one due schedule and exit. |
| `npm run analysis-worker` | Poll and process optional queued AI regression analyses. |
| `npm run analysis-worker:once` | Process at most one queued AI analysis and exit. |
| `npm run db:migrate` | Apply pending SQL migrations. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript validation. |
| `npm test` | Deterministic unit tests; no live provider calls. |
| `npm run build` | Production build. |

## Configuration

See `.env.example` for server-side configuration names. Do not commit `.env.local`, API keys, OAuth secrets, database URLs, or real provider payloads. `DATABASE_URL`, `AUTH_SECRET`, and OAuth credentials must be configured for the app. `PAGESPEED_API_KEY` is required for successful audits. AI explanations remain optional and unavailable until `OPENAI_API_KEY` is configured.

## Current scope and operations

- Audits are queued in PostgreSQL; run the worker separately from the web process.
- Each workspace may monitor up to 100 URLs. Per-URL daily, weekly, or monthly scheduling is optional and can be paused; an organization is capped at 20 queued/running audits before due dispatch is deferred.
- Manual release markers can be linked to completed audits. The association records context supplied by the user and does not imply causation.
- Only HTTPS URLs with public hostnames and standard HTTPS port are accepted. The application itself calls only the fixed Google API host; Google performs the Lighthouse target fetch.
- The login page supports one-time guest audits limited to 3 per hour per client fingerprint. Guest status is accessible only with a random in-memory browser token and expires after 24 hours; sign in to keep monitored history.
- Lighthouse lab results are distinct from CrUX real-user field data. Per-URL history shows separate lab performance and field LCP trends.
- Regression decisions compare compatible successful observations only. Events retain before/after values and the policy version; acknowledge them in the regression inbox. They describe run-to-run changes, not deployment causation.
- GitHub issue drafts require a validated recommendation, an editable review, and explicit confirmation. The server checks current repository access again at submission and records successful, failed, or ambiguous outcomes.
- The local Compose volume persists between runs. Remove it only if you intentionally want to delete local development data.

## Architecture and product docs

- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [API and integrations](docs/API_AND_INTEGRATIONS.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Testing strategy](docs/TESTING_STRATEGY.md)
- [Security and operations](docs/SECURITY_AND_OPERATIONS.md)
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Architecture decisions](docs/DECISIONS.md)

## Deployment

The [Dockerfile](Dockerfile) produces a standalone web image that also includes worker entrypoints. Deploy web, audit worker, scheduler, and optional analysis worker as separate processes from one revision; keep only the web process public. The [operations runbook](docs/OPERATIONS_RUNBOOK.md) covers provider configuration, migrations, limits, backup, and restore. No hosting account, production secrets, or live provider credentials are configured in this workspace.
