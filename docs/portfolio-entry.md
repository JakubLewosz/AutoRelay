# Portfolio entry

## GitHub profile description

AutoRelay is a webhook-driven automation platform that evaluates a safe
conditional rule and delivers one retryable HTTP or Discord action. It combines
a FastAPI API, PostgreSQL-backed sessions and execution queue, a separate worker,
and a responsive React dashboard while documenting authorization, encryption,
CSRF, and SSRF tradeoffs honestly.

## Technology

Python 3.12, FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL, asyncpg, httpx,
React, TypeScript, Vite, TanStack Query, React Hook Form, Zod, Tailwind CSS,
pytest, Vitest, Playwright, Docker Compose, Nginx, and GitHub Actions.

## Proposed repository description

Webhook-driven automation platform with conditional rules, PostgreSQL execution
history, background processing, and retryable HTTP and Discord actions.

## Proposed GitHub topics

- `automation`
- `webhooks`
- `fastapi`
- `react`
- `typescript`
- `postgresql`
- `docker`
- `background-jobs`
- `api`
- `portfolio-project`

## Interview talking points

1. **Durable work without a separate broker:** explain why PostgreSQL row locking
   with `FOR UPDATE SKIP LOCKED` is a proportionate MVP choice, how stale claims
   and bounded retries work, and when measured scale would justify a broker.
2. **Capability URLs and application secrets:** discuss hashed session/webhook
   verification, Fernet-encrypted recoverable configuration, immediate token
   rotation, redacted API models, and the limits of application-level encryption.
3. **Safe user-configured networking:** walk through scheme, credential, hostname,
   IP-range, redirect, and timeout controls; then explain the remaining DNS
   rebinding race and why network egress policy is the stronger production layer.
