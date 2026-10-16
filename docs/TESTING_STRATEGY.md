# Testing strategy

Vitest, ESLint, TypeScript, Next production build, and PostgreSQL migrations are wired into local/CI checks. Tests are deterministic by default; CI never calls production services. Current automated coverage includes URL policy, bounded responses, PageSpeed/CrUX normalization, regression thresholds, AI schema/evidence grounding, and GitHub token encryption. Route-level tenant authorization and full browser journeys remain planned.

## Layers

- **Unit:** URL normalization/policy, metric units and missingness, compatibility rules, regression thresholds/severity/dedupe, job transitions, evidence validation, JSON schemas, rate-limit/backoff decisions.
- **Integration:** API handlers with disposable PostgreSQL/migrations; tenant-scoped queries; job lease/expiry/idempotency; dashboard pagination/downsampling; provider adapters against mocked HTTP; GitHub flow mocked; auth/session/CSRF boundaries.
- **End-to-end:** sign in/project, add URL, queue audit, inspect queued/completed/partial/failed states, view available/unavailable CrUX, compare history, view regression, review issue draft and confirm through a mocked GitHub provider.
- **Security:** URL schemes/userinfo/ports, IPv4/IPv6 private/reserved addresses, localhost aliases, DNS rebinding/redirect policy, encoded IP/domain edge cases, body/rate limits, tenant IDOR, CSRF/OAuth state, encrypted credentials/redaction, prompt injection/evidence spoofing, XSS in audit strings, dependency/config leak checks.
- **Accessibility:** keyboard/focus, semantic labels, contrast, chart alternatives, status announcements and responsive layouts.

## Mocks and live calls

- Mock PSI and CrUX with schema-versioned fixtures: complete, partial, no data, origin-level, malformed, timeout, 429, 5xx, invalid key, CAPTCHA/runtime error.
- Mock LLM valid/malformed/oversized/hallucinated evidence IDs/refusal/injection/timeout/rate limit. No private page content or secrets in fixtures.
- Mock GitHub success/403/404/429/5xx/ambiguous timeout/duplicate submit. Automated tests never POST a real issue.
- Live smoke checks are manual and opt-in in staging against an allowlisted public URL, strict quota cap and configured test credentials; never run in PR CI.

## Critical cases

- Missing vs zero; units/precision; CLS string; no p75; experimental TTFB; CrUX page vs origin; overlapping rolling windows.
- Lab LCP/FCP/CLS vs CrUX field; Lighthouse has no INP lab measure; TBT is not INP; null score/category; provider version changes; localized display text.
- Incompatible URL/source/device/scope; absent baseline; failed previous run; duplicate job; cancellation; retry after success; zero denominator; stale field window.
- Duplicate scheduler, worker crash after provider success, expired lease, DB failure, retry exhaustion, provider quota, tenant limit, schedule abuse.
- Concurrent GitHub confirms, permission revoked, response timeout after issue created, unsafe Markdown, user membership removed.

## AI evaluation

- Enforce schema and evidence-ID membership server-side; use synthetic golden fixtures.
- Evaluate groundedness, relevance, prioritization, uncertainty, refusal with insufficient evidence, and prompt-injection resistance.
- CI checks invariants rather than prose similarity: no unsupported claim, each recommendation cites supplied evidence or explicit uncertainty, valid schema, and no change to deterministic regression.
- Review cost, latency, provider data policy and quota before rollout. AI remains feature-flagged.

## Fixtures and CI gates

Fixtures contain synthetic data and source/device/window/schema version. Remove credentials, query secrets, personal data and full HTML. Use disposable DBs and stable clocks; never use user production history in standard tests. Preserve compatibility fixtures across provider upgrades.

CI runs format/lint/type-check/unit tests, migration and DB integration checks, mocked provider contracts, security boundary tests, production build, dependency/security checks, E2E and accessibility checks before release. Docs change with API/schema/operations behavior.

## Release gates

No deployment until required suites pass, migration is reviewed, staging smoke and restore procedures pass, quota caps are configured, logs are redacted, and UI provenance/missing data are accurate.
