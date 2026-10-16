# Web Performance Intelligence Platform

## Vision

Help engineers and engineering teams monitor public websites, understand measured performance changes, inspect Lighthouse evidence, and turn validated findings into reviewed remediation work. The product remains useful when AI or an external provider is unavailable.

## Users and use cases

- Frontend/platform engineers monitor owned pages and investigate regressions.
- Engineering leads compare pages, devices, and releases and assign work.
- Team admins manage project membership, integrations, and monitoring limits.
- Users review and explicitly confirm GitHub issue drafts before submission.

## Functional requirements

1. Manage websites/projects and canonicalized, deduplicated monitored HTTPS URLs.
2. Run manual mobile/desktop Lighthouse audits; track queued/running/succeeded/partial/failed states and history.
3. Normalize/store lab metrics, scores, selected audit evidence, and provider/version/device/time context.
4. Query CrUX page and origin field data separately; preserve available LCP, INP, CLS, FCP, experimental TTFB p75/histogram, form factor, and collection period.
5. Show project and URL health, bounded historical trends, URL comparisons, compatible baselines, and latest run status.
6. Detect regressions deterministically against prior compatible runs or configured baselines, using absolute/relative thresholds and conservative noise handling. Retain events and provide in-app alerts.
7. Optionally produce evidence-referenced structured AI analysis with uncertainty, schema validation, and fallback.
8. Connect GitHub securely and create an issue only after user review and explicit confirmation.
9. Support manual release markers and distinguish temporal association from causality.
10. Configure schedules within quotas, caps, pause controls, and deployment constraints.

## Non-functional requirements

- Secure multi-tenant ownership, accessible responsive UI, and honest provenance/unavailable states.
- Bounded provider calls, retries and response sizes; durable idempotent jobs; structured redacted logs; health checks; migrations; backup/recovery.
- No fabricated values, secrets in browser bundles/logs, or unbounded history queries.

## User stories

- As an engineer, I add a public URL and run a selected-device audit to inspect a real result and its evidence.
- As an engineer, I compare compatible history and see source, device, window, and missing-data context.
- As a lead, I configure regression thresholds and see measured before/after evidence.
- As an engineer, I request optional analysis grounded in named findings and see uncertainty where evidence is weak.
- As a user, I review and confirm an issue draft for a repository I am authorized to use.
- As an admin, I manage team access and monitoring limits.

## Scope

### MVP

- Authenticated personal/team workspace with ownership boundaries.
- Website/URL management; manual mobile/desktop PSI audit; durable status/history; URL detail view.
- PSI Lighthouse lab results plus dedicated CrUX API field lookup, with source, page/origin scope, device, and rolling-window labels.
- Initial deterministic previous-compatible-run regression detection and in-app event view.
- Local setup, deployment plan, tests, and operational logging/health checks.

### Version 1 public release

- Project memberships/roles and scheduled monitoring with quotas, backoff, and pause controls.
- Bounded trend and URL comparisons, configurable baselines, accessible charts.
- Regression history/alert management and manual release markers.
- Optional evidence-grounded LLM analysis with structured validation/fallback.
- Secure GitHub App integration, repository selection, review/confirm, idempotency, and outcome history.
- Backup/restore, retention, rate limits, deployment diagnostics, and production readiness.

### Future enhancements

- GitHub release/deployment association and verified deployment-triggered comparisons.
- Email/chat notifications, SSO, advanced analytics, CrUX History API backfill, and higher-scale queues if measured demand warrants them.

## Explicit non-goals

- Replacing RUM or claiming CrUX represents every visitor.
- Claiming a run-to-run difference was caused by a deployment.
- Letting an LLM measure performance, determine regressions, or autonomously modify code/create issues.
- Scanning arbitrary internal URLs or acting as a general vulnerability scanner.
- Microservices, Kubernetes, or mandatory Redis/broker for the initial release.

## Success criteria

- User adds a public HTTPS page, runs an audit, and sees persisted lab and field data with truthful labels.
- Fixtures demonstrate thresholded deterministic regression; missing/incompatible data never becomes zero or a fabricated change.
- Dashboard queries are bounded and ownership-scoped.
- Core audit/history/regression flows work with AI disabled.
- No GitHub issue is created without review, confirmation, and repository authorization.
- Fresh deployment follows documented setup, health, and recovery procedures.

## Milestone acceptance

See `docs/IMPLEMENTATION_PLAN.md` for verifiable acceptance criteria and gates. The user approved implementation on 2026-10-14; Phase 0–2 work is underway.
