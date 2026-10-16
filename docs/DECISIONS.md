# Architecture decisions

**Status:** Proposed for review, not implementation commitments. Record accepted/revised choices here as work is approved.

## ADR-001: Modular Next.js/TypeScript application

- **Context:** Empty repository; product needs dashboard, authenticated APIs, integrations and a showcaseable deploy.
- **Options:** Next.js full-stack; Next.js + FastAPI; separately deployed frontend/backend.
- **Recommendation:** One Next.js/React/TypeScript codebase with domain/provider boundaries and same-repo worker entrypoint.
- **Rationale:** Shared language/types and fewer deployments simplify first release. Python service is not justified absent a Python-specific workload/team need.
- **Consequences:** Still requires durable worker runtime; boundaries should permit future extraction.

## ADR-002: PostgreSQL system of record and initial queue

- **Context:** Audits are long-running and must survive process restart, retries and duplicate scheduling.
- **Options:** Inline requests; PostgreSQL jobs; Redis/managed broker.
- **Recommendation:** PostgreSQL job table with leases, attempts, idempotency and worker polling initially.
- **Rationale:** Transactional state and no unnecessary infrastructure at early volume.
- **Consequences:** Lease recovery, polling and DB load need monitoring. Reassess from throughput/latency metrics.

## ADR-003: Separate PSI lab from CrUX field

- **Context:** Historical Core Web Vitals and Lighthouse evidence required; PSI documentation says embedded CrUX inclusion is planned for discontinuation and recommends CrUX API/History API.
- **Options:** PSI `loadingExperience`; dedicated CrUX API; CrUX BigQuery.
- **Recommendation:** PSI v5 for lab; dedicated CrUX `queryRecord` for field snapshots; consider History API separately for backfill.
- **Rationale:** Clear source/provenance and less exposure to PSI field-data removal.
- **Consequences:** Extra API key/quota/cache path; rolling 28-day values can be missing and cannot be treated as per-run lab values.

## ADR-004: Deterministic regressions; AI advisory only

- **Context:** Users need transparent alerts and product must work without model provider.
- **Options:** LLM decides regressions; deterministic rules; rules plus optional explanation.
- **Recommendation:** Versioned deterministic thresholds decide; optional LLM explains stored evidence.
- **Rationale:** Reproducible and testable, with safe fallback.
- **Consequences:** Threshold tuning and groundedness need product/testing work; model cannot authorize side effects.

## ADR-005: GitHub App for issue creation

- **Context:** Users create issues in selected repositories and credentials must be protected.
- **Options:** PAT, user OAuth token, GitHub App installation.
- **Recommendation:** GitHub App with minimum issue-write permissions and repository scope.
- **Rationale:** Revocable scoped authorization without long-lived user PATs.
- **Consequences:** More onboarding and secret-management setup; verify current GitHub permissions/limits before implementation.

## ADR-006: Require worker-capable deployment

- **Context:** PSI calls may be long, schedules recur, and jobs must survive request termination.
- **Options:** Inline/serverless-only; same-code worker on container host; managed queue/worker.
- **Recommendation:** Container-capable host with web + worker, managed Postgres and scheduler, or a documented managed queue alternative.
- **Rationale:** Durable execution without pretending a web request is a job system.
- **Consequences:** Vendor choice depends on runtime, secret handling, DB pooling, backup, region and cost; vendor remains open.

## ADR-007: Use Google OAuth for sign-in, separate GitHub App for issue writes

- **Context:** The MVP needs real authentication and tenant-scoped ownership before project data exists; the issue integration later needs narrowly scoped repository write access.
- **Options:** Managed auth vendor; Google or GitHub OAuth through Auth.js; custom email/password.
- **Recommendation:** Use Auth.js Google OAuth as the primary identity provider and retain GitHub OAuth as an alternative for existing accounts. Keep issue creation on a separate GitHub App installation flow with independent permissions.
- **Rationale:** Google provides a familiar personal-account login without suggesting that repository access is required. OAuth avoids building password reset/verification infrastructure and keeps identity separate from repository write authorization.
- **Consequences:** Local sign-in requires a Google OAuth web client and configured client credentials; production access depends on Google. Google and GitHub identities are not automatically linked. OAuth credentials and session secret remain server-side.

## Open questions

1. Which host and managed PostgreSQL fit budget and support workers/scheduler?
2. Which identity provider and tenant model? Recommendation: personal workspace represented as tenant, with basic project roles for public release.
3. Which LLM provider/model/privacy and spending settings? It can remain disabled until Phase 5.
4. What URL-count/audit-frequency caps are affordable under current PSI/CrUX quota?
5. What evidence retention and deletion/export commitments are desired?
6. Which charting/migration tooling best fits selected runtime and accessibility needs?
7. Are email notifications needed for first public release? Recommendation: defer; start with in-app alerts.

Non-blocking choices should be resolved in the planned phase and recorded before coding the affected feature.
