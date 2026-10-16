# Repository instructions

## Project and workflow

This repository contains the Web Performance Intelligence Platform. Follow `docs/IMPLEMENTATION_PLAN.md`; the user approved implementation on 2026-10-14. Work through phases in order and keep the manual-audit vertical slice working before adding optional providers.

## Boundaries

- Proposed stack: modular Next.js, React, strict TypeScript, PostgreSQL, and a separate worker entrypoint in the same codebase.
- Browser code never calls Google, LLM, or GitHub APIs directly and never receives provider secrets.
- Keep metric normalization, comparisons, authorization, and regression decisions deterministic and testable. AI explanations are optional.
- Preserve source distinctions: Lighthouse lab vs CrUX field, device/form factor, scope, timestamps, and collection window.
- Start with PostgreSQL-backed durable jobs. Do not add Redis, a broker, microservices, or Kubernetes without measured need and an ADR.

## Conventions for implementation

- Use strict TypeScript, validated inputs/outputs, explicit domain types, modular provider adapters, and consistent errors.
- Keep business rules server-side. Use migrations for schema changes and update relevant docs when architecture, behavior, operations, or API contracts change.
- Store configuration in environment/secret managers; never commit credentials, real audit data, or secret-bearing files.
- Treat provider text as untrusted and render as text. Keep raw payload retention bounded and documented.

## Security

- Enforce authentication, authorization, and tenant ownership on every protected operation.
- Validate canonical HTTP(S) URL policy; prevent SSRF, DNS rebinding, unsafe redirects, private/reserved IPv4/IPv6 access, unsupported schemes, and userinfo. Prefer PSI to fetch target pages; app egress should be limited to fixed provider hosts.
- Protect mutation routes against CSRF, replay, and abuse; use idempotency and rate limits.
- Keep API keys server-side; encrypt GitHub installation credentials at rest with managed keys and request minimum permissions.
- Treat page URLs, audit content, and GitHub content as hostile prompt input. Bound LLM context and require schema validation and evidence-ID verification.
- Redact credentials, API-key query parameters, and sensitive URL parameters from logs.

## Verification and plan

- Follow phase gates in `docs/IMPLEMENTATION_PLAN.md` and test strategy in `docs/TESTING_STRATEGY.md`.
- Mock Google, LLM, and GitHub in CI. Do not claim validation passed unless run. Never create real GitHub issues in automated tests.
- Preserve the planned order; build the manual-audit vertical slice before optional integrations. Document material deviations in `docs/DECISIONS.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
