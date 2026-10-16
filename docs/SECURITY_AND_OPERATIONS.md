# Security and operations

**Implementation status:** Google primary and optional GitHub OAuth identities, tenant-scoped workspace queries, URL policy, bounded provider responses/retries, durable audit leases, row-locked schedule dispatch with organization caps, manual release associations, database-backed tenant rate limits, standard security headers, container packaging, and secret-free health reporting are implemented. Production deployment, external monitoring, retention, backups, and release validation remain.

## Identity and tenant boundaries

- Authenticate protected routes with server-side sessions, secure/HttpOnly/SameSite cookies, session rotation, CSRF protection and explicit role checks.
- Scope every project/website/URL/audit/finding/regression/recommendation/release/integration query to an authorized tenant. Never trust client tenant IDs.
- Test access boundaries on every route. RLS is optional defense in depth only after reviewing connection-pool tenant context; it does not replace service authorization.
- Define invitation expiry, role changes, deletion/export and integration disconnect before public multi-user rollout.

## Secrets

- Keep Google, LLM, GitHub App, auth, encryption, and database credentials in deployment secret manager. `.env.example` contains names and dummy placeholders only.
- Never expose secret-bearing variables in browser bundles/client errors. Restrict Google keys by enabled API/environment and redact query values (Google accepts API keys in query parameters).
- GitHub user tokens are encrypted in the database with AES-256-GCM using a separate 32-byte environment key and key-version field; the GitHub authorization can be revoked from the connection screen. Supply the key through a secret manager. KMS/envelope integration and a tested key-rotation migration remain production work.
- Limit production secret access and scan for accidental commits/log leaks.

## URL safety and SSRF

- Accept canonical HTTPS URLs; enable HTTP only if explicitly justified. Reject userinfo, unsupported ports/schemes, malformed IDNs, localhost and literal private/reserved IPv4/IPv6 destinations.
- At execution validate all A/AAAA results, IPv4-mapped IPv6 and unusual encodings; defend against DNS rebinding. If the application ever fetches a target directly, pin validated destinations and recheck every redirect hop. Prefer PSI to fetch target pages; application egress uses fixed Google hosts only.
- Bound URL length/count, audit frequency, response size, concurrency and tenant work. Disable alternate protocols, user-provided proxy settings, and unsafe redirect following. Use egress firewall where available.

## GitHub and LLM

- GitHub App user token with Issues write and metadata read; verify tenant ownership, installation and repository again at submission; explicit review/confirm; idempotency and duplicate fingerprint; encrypt/revoke credentials; protect one-time OAuth state and PKCE.
- Escape user/provider text in UI and sanitize issue Markdown. Issue creation does not need repository code read permission.
- Treat URLs, audit findings, GitHub text and release metadata as untrusted. Send bounded allowlisted context to LLM, omit secrets/query data, validate schema/evidence IDs, store provenance, and never let model output create an issue autonomously.

## Abuse and provider quotas

- Database-backed tenant rate limits currently cap URL creation, manual audits, AI analysis, GitHub connection/issue creation, release markers, and schedule changes. Add global concurrency and cost caps in the deployment layer.
- The login-page guest flow permits one-time public audits with same-origin POST checks, the shared HTTPS/SSRF URL policy, a 4 KB request-body bound, a per-client limit of 3/hour, a global active-job cap of 50, and an unguessable bearer token stored only as a digest. Tokens expire after 24 hours; guest organizations are removed during expiry cleanup on later guest submissions. Configure and verify trusted proxy headers before relying on forwarded client IPs for public rate limits.
- Use durable queue, idempotency, leases, bounded jittered retries, Retry-After, terminal status and operator visibility. Do not retry invalid requests or uncertain GitHub writes blindly.
- Cache/coalesce CrUX by normalized query/form factor/window. Current docs state 150 requests/minute/project; verify actual project quota. Verify PSI quota and host execution constraints before launch.
- Expose tenant caps and pause controls; keep a global emergency pause for audits/AI/GitHub.

## Logging and monitoring

- Log request/job IDs, safe internal IDs, state transitions, provider/status/latency/retry, queue age, error class and quota usage.
- Redact auth headers/tokens, API key query params, sensitive URL query params, raw user content and full provider payloads. Restrict audit evidence access/retention.
- Monitor web/worker readiness, DB pools, queue depth/age/expired leases, provider errors/latency/rate limits, scheduler success, evidence volume, backups and GitHub uncertain outcomes.
- Alert on sustained queue growth, repeated quota exhaustion, worker/DB/backup failures and unusual spend. Avoid alerts for expected no-CrUX-data.

## Deployment and recovery

- TLS, standard security headers, private database networking, least-privilege identities, separate staging/prod projects and secrets, pinned build artifacts. Add a deployment-specific CSP after verifying OAuth callbacks and app assets.
- Review migrations and use additive/backfill/contract strategy for breaking schema changes. Run migrations once in a controlled release step with backup/rollback plan.
- Encrypted automated DB backups and documented restore; perform restore drill before public launch.
- Worker has no public ingress. Scheduler is authenticated and idempotent. Health checks disclose no configuration/secrets.
- Choose host after verifying worker/scheduler capability, DB pooler, secret management, backups/restore, region and cost.

## Privacy and retention

- Store only monitored URL and compact evidence needed for history/recommendations; strip sensitive query parameters where possible. Avoid retaining fetched HTML (the app should not fetch/store it).
- Define retention and deletion/export for compact evidence, raw provider payloads, issue outcomes and audit history. Backups follow same privacy policy.
- User-triggered LLM sends bounded audit metadata to third party; disclose provider/model/data handling, minimize input, honor retention controls and allow disabling.
- CrUX is aggregated, not identifiable visitor data; explain rolling window and page/origin eligibility.
