# Implementation plan

**Status:** Approved for implementation on 2026-10-14. Phases 0–6 implementation is in place; configured OAuth/PSI/LLM/GitHub smoke validation remains outstanding. Phase 7 production hardening remains. Repository initially had planning docs only and no Git metadata.

## Delivery rules

- Build a manual-audit vertical slice before broad scaffolding.
- Preserve source distinctions and make regression decisions deterministic.
- Keep provider calls mocked in CI; live calls/issues are never default tests.
- Each phase has a completion gate; do not skip ahead.

## Phase 0 — Runtime decisions and bootstrap (MVP foundation)

**Deliver:** Local dev setup, Next.js/TypeScript skeleton, auth boundary, PostgreSQL/migration foundation, worker entrypoint, CI quality checks.

**Likely files:** package/config files, `src/app/`, `src/server/`, `src/domain/`, `src/providers/`, `src/worker/`, `db/migrations/`, `.env.example` placeholders, CI and local-dev files, README/docs.

**Tasks:** Choose host/auth/migration/test/chart tools; verify worker, scheduler, execution and DB limits/cost; scaffold strict TypeScript app and worker; configure local DB and safe env validation; establish sessions and tenant authorization primitives; add CI and health/readiness.

**Depends on:** Explicit approval of this planning phase.

**Verify:** Clean local bootstrap; lint/type-check/unit/build; migration against disposable DB; auth/tenant tests; health endpoint secret-free; web and worker start independently.

**Acceptance:** A new developer reaches an authenticated shell by following README; CI is deterministic and makes no real API calls; cross-tenant access tests fail closed; no secrets in client bundle; independent web/worker entrypoints share one revision.

## Phase 1 — Website management and manual audit vertical slice (MVP)

**Deliver:** Add monitored URL; enqueue mobile/desktop PSI; durable job states; normalized Lighthouse result/evidence; inspect run and history.

**Likely modules:** URL/audit domain, PSI adapter, website/audit routes and UI, job repository/worker handler, project/website/URL/audit/job migrations, mocked fixtures.

**Tasks:** Canonical URL/deduplication and tenant caps; URL safety; PSI client with timeout/error mapping/retry; job lease/idempotency state machine; normalize scores and lab metrics by stable IDs; retain compact evidence and provider context; show pending/partial/failure states.

**Depends on:** Phase 0 auth, DB and worker.

**Verify:** URL policy/normalizer units; mocked complete/partial/invalid-key/429/timeout PSI; worker idempotency/retry; API/UI integration; tenant and unsafe URL security tests. Optional manual smoke audit only after safe credentials/configuration.

**Acceptance:** Owner adds canonical HTTPS URL once; duplicate detected; mobile/desktop run is durable and visibly queued/succeeded/partial/failed; available scores and LCP/FCP/CLS lab values persist with source/device/units; missing values remain missing; raw evidence is bounded; no direct arbitrary app fetch; outage/quota failure is actionable and does not lose run.

**Gate:** Repeatable user journey creates and inspects a persisted lab audit.

## Phase 2 — CrUX field data and historical dashboard (MVP)

**Deliver:** Dedicated CrUX API lookup and bounded dashboard with trends, provenance, device splits, and compatible comparisons.

**Likely modules:** CrUX adapter, source-specific metric types, collection-period snapshots, indexed dashboard read models/API, accessible charts/detail UI.

**Tasks:** Query page URL/form factor and optionally origin fallback separately; store p75/histogram/window/normalization details; add bounded date and cursor aggregation; draw lab and field series separately; compare only compatible source/device/scope observations.

**Depends on:** Phase 1.

**Verify:** Fixtures for absent data, decimal CLS, units, p75, origin fallback, URL normalization, overlapping windows; mocked provider failures; query/index review; accessible chart/table and dashboard E2E.

**Acceptance:** LCP/INP/CLS/FCP/experimental TTFB shown only if returned; no INP inferred from Lighthouse TBT; no data shown as unavailable rather than zero; origin fallback labeled; field snapshots retain 28-day window and form factor; histories are bounded and tenant-scoped; no silent mixing of lab/field, devices, or page/origin scope.

**Gate:** Provenance and missingness are clear; dashboard remains bounded as history grows.

## Phase 3 — Deterministic regressions and in-app alerts (MVP) — implemented

**Deliver:** Configurable thresholds, compatible baseline/previous-run comparisons, severity/evidence, deduplicated regression history and alert view.

**Likely modules:** regression domain, policy/event/alert migrations, comparison service, alerts API/UI, audit completion pipeline.

**Tasks:** Define metric direction, default absolute/relative thresholds, compatibility key, baseline reset, noise suppression, severity, event lifecycle/acknowledgment and dedupe. Keep Lighthouse score and CrUX field changes separate.

**Depends on:** Phases 1–2.

**Verify:** Boundaries, up/down metrics, missing values, zero denominator, failed runs, incompatible dimensions, noisy changes, deduplication and tenant tests.

**Acceptance:** Decisions are deterministic/reproducible from values and policy version; failed/missing/incompatible values never fabricate regressions; small changes under thresholds are suppressed; severity and before/after evidence visible; repeated processing does not duplicate event; AI never decides status.

**Implementation:** Migrations 004–005, deterministic rule engine, versioned custom/default policy evaluation, compatible prior-observation comparison, deduplicated events, in-app alerts, project-scoped threshold API, regression inbox and acknowledgment are implemented. Unit coverage includes direction, threshold boundaries, severity, zero baseline and invalid values. Runtime check remains pending valid OAuth/provider credentials.

## Phase 4 — Schedules and manual release markers (Version 1) — implemented

**Deliver:** Quota-aware recurring audits, pause/resume, due-job scheduler and manually recorded release markers.

**Likely modules:** schedules API/UI, scheduler entrypoint, quota policy, worker metrics, release marker model/UI.

**Tasks:** Frequency choices, per-tenant URL/concurrency caps, idempotent due slots, retry/backoff/jitter, terminal/manual retry, usage visibility; manual label/time/commit marker association explicitly marked user-provided.

**Depends on:** Phases 1–3 and a worker/scheduler deployment host.

**Verify:** Fake clock, duplicate scheduler, lease expiration, quota simulation, abuse limits, release association, deployment dry-run.

**Acceptance:** Duplicate scheduler does not enqueue duplicate work; caps and pause bound dispatch; errors back off and terminal work surfaces; manual association is not described as causality; global usage is observable.

**Implementation:** Migration 006, per-URL daily/weekly/monthly schedule controls, a separate polling scheduler, row-locked due dispatch with audit idempotency keys, per-organization active-job cap, and manual release markers with completed-audit association are implemented. Operational observation of a deployed scheduler and load/duplicate-process simulation remain deployment validation.

## Phase 5 — Evidence-grounded AI (Version 1) — implemented

**Deliver:** Optional structured explanation of actual audit findings/compatible changes, with evidence references, uncertainty, and fallback.

**Likely modules:** LLM adapter, bounded input builder, output schema, analysis jobs/tables/API/UI, redaction and synthetic evaluation fixtures.

**Tasks:** Allowlist and size-bound evidence; treat inputs as untrusted; schema for summary/prioritized recommendations/impact/uncertainty/evidence IDs; validate IDs; bounded provider timeout/retries/quotas; store model/schema version; display links and disabled/failure state.

**Depends on:** Phases 1–3.

**Verify:** Mock valid/malformed/oversized/hallucinated-ID/injection/timeout/rate-limit/empty evidence; invariant-focused evaluation; human review of representative output.

**Acceptance:** Only supplied evidence is cited; uncertain conclusions are labeled; malformed or ungrounded output rejected; disabled/unavailable AI leaves deterministic workflows intact; model cannot alter metrics/regression/auth; sensitive query data excluded.

**Implementation:** Migration 007, a bounded analysis queue/worker, optional OpenAI Responses API adapter with Structured Outputs, strict Zod validation, supplied-evidence ID enforcement, no URL query strings in prompts, and an explicit analysis panel are implemented. Unit tests cover grounded, unknown, and missing evidence references. A live call remains pending provider credentials.

## Phase 6 — GitHub issue creation (Version 1) — implemented

**Deliver:** GitHub App connection, authorized repository picker, editable issue preview, explicit confirmation and auditable outcome.

**Likely modules:** App/OAuth routes, encrypted credential service, repo picker, draft/confirm API/UI, issue outcome table, provider mocks.

**Tasks:** Callbacks/state/CSRF; minimum issue-write scope; installation/repository checks; managed encryption and revocation; idempotency/duplicate protection; validated issue body; handle ambiguous timeout; log outcome.

**Depends on:** Phase 5 recommendation model and production secret manager.

**Verify:** Mock success/403/404/429/5xx/timeout/duplicate; authorization, OAuth and encryption review; no real issue in tests.

**Acceptance:** Select only authorized repositories; issue includes URL/evidence/recommendation/dashboard link; explicit review and confirm; permission rechecked at submit; credentials encrypted/revocable; outcomes auditable with safe retry.

**Implementation:** Migrations 008–009, OAuth state + PKCE callback, account-identity check, AES-256-GCM encrypted access/refresh token bundle, refresh and disconnect/revocation, repository selection limited to authorized installations with Issues write, editable recommendation draft, server-side reauthorization at submit, idempotency/fingerprint guard, ambiguous outcome lockout, and outcome history are implemented. Live GitHub validation remains pending App credentials and installation.

## Phase 7 — Public release hardening (Version 1 completion) — foundation implemented; deployment validation remains

**Deliver:** Production deployment, accessibility, observability, retention/backup/recovery, and complete end-to-end workflows.

**Likely modules:** CI/deploy, migration controls, rate limits, logs/metrics, health checks, retention job, runbooks, E2E suite.

**Tasks:** Threat/tenant review; DB pooling/indexes; quota dashboards; export/deletion/retention; encrypted backup and restore drill; staging deploy; provider-outage exercise; accessibility/dependency review; release checklist.

**Depends on:** Phases 0–6.

**Verify:** Mocked CI, E2E, security review, staging migration/restore, outage checks, accessibility and health/readiness.

**Acceptance:** Deploy/rollback/migration/restore documented and exercised; metrics cover jobs/providers/queue/quota/DB without secrets; security, grounding, URL and confirmation gates pass; accessible responsive UX handles unavailable/partial data; core audit history remains useful when CrUX, GitHub, or AI is unavailable.

**Implementation:** Standalone non-root Docker image, documented web/worker/scheduler topology, security headers, tenant-scoped database rate limits, migration CI, runbook, backup/restore procedures, and feature-degraded operation are in place. Hosting-provider configuration, rate-limit load validation, external monitoring, retention/export/deletion policy, accessibility review, and an actual restore drill require a deployment environment and remain incomplete.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| PSI latency/quota and run variability | Async jobs, caps, backoff, compatible comparisons and source-specific status. |
| PSI field data discontinued | Use dedicated CrUX API from outset; recheck docs before implementation. |
| CrUX rolling/missing data | Explicit window, page/origin labels, missing states and careful thresholds. |
| SSRF | Strict URL policy, DNS/IP and redirect defenses; no direct app target fetch. |
| Serverless limits | Choose worker-capable host or managed durable queue/worker. |
| Noisy alerts | Conservative thresholds, compatible inputs, dedupe, no event for failures/missing values. |
| LLM hallucination/injection | Bounded evidence, untrusted-input handling, structured schema and ID validation. |
| Credential breach | GitHub App, minimal permissions, KMS encryption, redaction and revocation. |
| Cost growth | URL/frequency/concurrency limits, usage visibility, disable flags; defer email. |
| Team SaaS complexity | Choose initial identity/tenant model in Phase 0 and test all access boundaries. |

## Project completion

All Phase 0–7 gates pass; user can monitor URLs, inspect honest lab/field history, detect deterministic regressions, optionally receive grounded analysis, review/confirm GitHub issues, associate manual releases, and operate the deployment with security, observability, and recovery documentation. Deferred work remains explicitly identified.
