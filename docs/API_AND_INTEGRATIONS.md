# API and integrations

**Implementation note:** The URL, authenticated audit enqueue/status, one-time guest audit, health, regression policy/list/acknowledgment, schedule, release marker/association, regression-analysis queue/status, GitHub OAuth connection, repository listing, and confirmed issue creation contracts are implemented. Google official docs were reviewed 2026-10-14; recheck before changing provider adapters because fields and limits may change.

## Internal API conventions

- JSON over HTTPS, server-side session and tenant authorization on protected endpoints.
- Validate all boundaries. Error shape: `{ "error": { "code", "message", "requestId", "retryable?" } }`; never expose stack/provider secrets.
- Use IDs, UTC ISO timestamps, explicit source/scope/form factor/unit, bounded cursor pagination, and idempotency keys for side effects.
- Proposed status mapping: 400 invalid input, 401 unauthenticated, 403 unauthorized, 404 absent/inaccessible, 409 conflict, 413 too large, 422 semantic validation, 429 app/provider quota, 502 malformed provider response, 503 unavailable/disabled, 500 unexpected.

## Proposed endpoints

| Method/path | Request and behavior |
|---|---|
| `GET/POST /api/v1/projects` | List scoped projects or create `{name}`. |
| `GET /api/v1/projects/:id/websites` | Bounded/cursor listing. |
| `POST /api/v1/websites` | `{projectId,name?,origin}`; validate/canonicalize HTTPS origin and quota. |
| `POST /api/v1/urls` | `{websiteId,url,label?}`; validate and deduplicate monitored URL. |
| `POST /api/v1/urls/:id/audits` | `{strategy:"mobile"|"desktop",idempotencyKey}`; return `202` with queued run ID. |
| `POST /api/quick-audits` | Public same-origin `{url,strategy?}`; validates public HTTPS, applies 3/hour client fingerprint and 50 active-job caps, returns a one-time bearer token with `202`. |
| `GET /api/quick-audits/:auditId` | Requires the one-time bearer token; returns bounded status, category scores, lab metrics, and CrUX INP p75/provenance until the 24-hour expiry. |
| `GET /api/v1/audits/:id` | Scoped status, summary and evidence links; avoid unbounded raw provider JSON. |
| `GET /api/v1/urls/:id/audits` | Bounded history by date/cursor/limit. |
| `GET /api/v1/projects/:id/dashboard` | Bounded date range/grain; source/device/scope-separated summaries and series. |
| `POST /api/v1/projects/:id/regression-policies` | Validate metric units/direction/threshold; store version. |
| `GET /api/v1/projects/:id/regressions` | Scoped regression and alert history. |
| `POST /api/v1/audits/:id/analyses` | Optional `{comparisonAuditRunId?}`; queue analysis. |
| `POST /api/v1/recommendations/:id/github-issue-drafts` | Repository and edited draft; preview only, no side effect. |
| `POST /api/v1/github-issues` | Recommendation/repository/title/body/idempotency/`confirm:true`; reauthorize then create. |
| `POST /api/v1/projects/:id/releases` | User-provided label, optional SHA/environment/time. |
| `GET/PATCH /api/v1/urls/:id/schedule` | Version 1 frequency/enabled controls within caps. |

An example response carries `auditRunId`, `status`, requested/final URL, strategy, completion time, a `lighthouse` object with category scores and lab metric values/units/source, and a `fieldData` object with availability, page/origin scope, CrUX form factor, collection dates and field metric p75 values. Example values are documentation shape only, not measurements. Missing values are omitted or carry an explicit availability reason, never zero.

## Google PageSpeed Insights (PSI)

- Endpoint: `GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed`; required `url`, optional `strategy=mobile|desktop`, category parameters for performance/accessibility/best-practices/SEO.
- Response includes `lighthouseResult`, category scores, audit map, requested/final URL, fetch time, Lighthouse version, environment/config and warnings. Normalize using stable audit IDs/category fields, not localized `displayValue` strings.
- PSI docs currently describe embedded CrUX, but state they plan to discontinue it and recommend CrUX API/History API. Use PSI for lab results and dedicated CrUX for field history; do not rely on `loadingExperience` for core field history.
- Google API key/project are server-only and restricted by API/environment. PSI quota/current latency must be verified in Cloud Console and docs during Phase 0. Bound calls and retry only transient statuses/429 with retry-after/backoff. Do not repeatedly retry invalid requests or CAPTCHA/runtime errors.
- Request each device strategy as bounded work. Partial category data remains visible with partial status.

Official: [PSI runPagespeed reference](https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed), [PSI getting started and embedded CrUX discontinuation note](https://developers.google.com/speed/docs/insights/v5/get-started).

## Chrome UX Report (CrUX) API

- Endpoint: `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=...`; requires Cloud API key provisioned for Chrome UX Report API. Keep key server-side; redact query values in logs.
- Request specifies exactly one `url` or `origin`, optional `formFactor` (`PHONE`, `DESKTOP`, `TABLET`) and metrics. CrUX `PHONE` is a real-user form factor, not equivalent to Lighthouse emulated mobile.
- Current documented field metrics: `largest_contentful_paint`, `interaction_to_next_paint`, `cumulative_layout_shift`, `first_contentful_paint`, and experimental `experimental_time_to_first_byte`; response includes histograms, p75 where supported, and `collectionPeriod`.
- Data is aggregated over a 28-day rolling window and updated daily on a best-effort basis. Current docs specify 150 requests/minute per Cloud project, without paid quota increase. Cache/coalesce normalized query + form factor + collection period and meter dispatch.
- A page may have no record. Optionally query origin separately and label that scope; never substitute silently. Map invalid key/API disabled/quota/network/5xx distinctly and verify exact service status behavior in integration setup.

Official: [CrUX API schema, data windows, fields, API key and quota](https://developer.chrome.com/docs/crux/api).

## LLM provider

- Optional provider uses the OpenAI Responses API. Configure server-side `OPENAI_API_KEY` and `OPENAI_MODEL` (defaults to `gpt-4o-mini`); run the separate analysis worker. Structured Outputs supplies schema-constrained JSON. See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
- Output includes summary, prioritized recommendations, expected impact, uncertainty, and evidence IDs. Verify each ID belongs to supplied evidence. Reject malformed, oversized or ungrounded responses.
- Treat URLs, audit strings, page findings and imported content as untrusted instructions; send only allowlisted bounded metadata; strip sensitive query data. Set timeouts, limited retries/cost/tenant quotas and log redacted provider/model/schema status.
- On disabled/unavailable provider, deterministic audit, history, and regression functions remain available.

## GitHub integration

- Use GitHub App user authorization so API actions respect both the user’s access and the App’s grant. Configure only repository `Issues: write` and metadata read; no repository code access is needed. GitHub documents the intersecting user/App permission model and issue endpoint permission [here](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user) and [here](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).
- Store user access/refresh tokens encrypted with AES-256-GCM, a random IV, authentication tag, and key version. Use a managed secret manager for `GITHUB_TOKEN_ENCRYPTION_KEY`; define and test key rotation before production. Refresh expired user tokens and revoke the GitHub App authorization when disconnecting. GitHub user tokens expire and support refresh [per its docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
- Protect callback with one-time database state, ten-minute expiry, session binding, and PKCE. Require editable review and explicit confirm; recheck installation, repository access, repository ID, and app Issues permission on submit.
- Body contains user-approved title, affected URL, recommendation, evidence and dashboard link. Sanitize Markdown; log outcome without tokens/full headers.
- Handle revoked permission, not-found, primary/secondary rate limit with `Retry-After`/reset, timeout and 5xx. Tests mock all responses and never create real issues.

## Configuration and retries

Names to settle in Phase 0: `DATABASE_URL`, auth settings, `PAGESPEED_API_KEY`, `CRUX_API_KEY`, GitHub App ID/private-key or managed-secret reference/client credentials, encryption/KMS reference, LLM provider/key/model, worker concurrency, URL/frequency caps, timeout/retry budgets, retention days and public base URL. `.env.example` only placeholders.

Outbound clients use fixed HTTPS origins, deadlines, bounded response sizes, limited retries with jitter where safe, rate-limit awareness, idempotency, structured error classes, and credential/query redaction. GitHub issue creation is not blindly retried after ambiguous timeout.

## Verify before coding

1. Recheck PSI endpoint/category fields, current quota and latency; embedded-field deprecation language may change.
2. Recheck CrUX metrics/p75/no-record shape and Cloud project quota.
3. Confirm host worker/scheduler/runtime, Postgres pooler, backups, region and secrets.
4. Confirm current GitHub App permissions/callbacks/limits when Phase 6 begins.
5. Confirm selected LLM structured-output, data retention/training policy, price and limits before Phase 5.
