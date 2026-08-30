# AutoRelay implementation plan

This checklist is the persistent implementation record for the MVP. A phase is
complete only after its listed checks have run successfully or a limitation is
recorded explicitly.

## Phase 0 — Isolated repository and architecture

- [x] Confirm an empty, dedicated `AutoRelay` directory.
- [x] Record available Python, Node.js, Docker, Compose, Git, and GitHub CLI tools.
- [x] Initialize Git on `main` without touching adjacent repositories.
- [x] Add repository guidance, architecture decisions, ignores, and environment template.
- [x] Verify the initial repository diff and commit it.

Acceptance criteria: the repository is isolated, contains no secret material,
and records the chosen architecture and implementation phases.

## Phase 1 — Backend foundation and authentication

- [ ] Configure FastAPI, Pydantic Settings, SQLAlchemy, Alembic, Ruff, mypy, and pytest.
- [ ] Add PostgreSQL models and the initial complete-schema migration.
- [ ] Add structured errors, request IDs, restricted CORS, and health/readiness routes.
- [ ] Implement registration, login, current-user, logout, database sessions, and CSRF.
- [ ] Test password hashing, session expiration, authentication, and CSRF behavior.
- [ ] Run backend format, lint, type, and focused test checks.
- [ ] Inspect and commit the phase.

Acceptance criteria: users can register, log in, remain authenticated by an
HttpOnly database-backed cookie, and log out; authenticated mutations require CSRF.

## Phase 2 — Workflows and owner API

- [ ] Add workflow, condition, and action services with ownership isolation.
- [ ] Encrypt action secrets and recoverable webhook tokens; hash webhook verification values.
- [ ] Implement workflow CRUD, activation/deactivation, test event, and token rotation.
- [ ] Validate condition and action configuration without exposing stored secrets.
- [ ] Test CRUD, ownership, redaction, encryption, enable/disable, and rotation.
- [ ] Run checks, inspect the diff, and commit the phase.

Acceptance criteria: each user can manage only their own workflows, with zero
or one safe condition, exactly one supported action, and immediately revocable webhook URLs.

## Phase 3 — Webhooks, queue, worker, and actions

- [ ] Add JSON-only, size-limited public webhook ingestion returning HTTP 202.
- [ ] Add safe condition evaluation and PostgreSQL `SKIP LOCKED` claiming.
- [ ] Add HTTP POST and Discord action execution with SSRF validation and redaction.
- [ ] Add automatic bounded retries, stale-run recovery, graceful shutdown, and manual retry.
- [ ] Add execution list/detail APIs with ownership, filtering, and pagination.
- [ ] Test token validation, conditions, action outcomes, SSRF, claiming, retry, and recovery.
- [ ] Run checks, inspect the diff, and commit the phase.

Acceptance criteria: webhook requests queue durable executions; the separate
worker safely processes them, records useful results, and retries only suitable failures.

## Phase 4 — React application

- [ ] Configure React, TypeScript, Vite, Router, TanStack Query, forms, Zod, Tailwind, and tests.
- [ ] Implement authentication pages and guarded application shell.
- [ ] Implement live dashboard, workflow list/form/detail, token controls, and cURL example.
- [ ] Implement execution filtering, pagination, detail view, JSON viewer, and retry interaction.
- [ ] Add loading, empty, error, not-found, responsive, and keyboard-accessible states.
- [ ] Add meaningful unit/component coverage.
- [ ] Run frontend lint, formatting, type, unit, and production-build checks.
- [ ] Inspect and commit the phase.

Acceptance criteria: the English UI is responsive and all required pages operate
against the real API without static dashboard data or unsafe HTML rendering.

## Phase 5 — Containers, CI, and end-to-end coverage

- [ ] Add backend and Nginx frontend Docker images plus four-service Compose setup.
- [ ] Run migrations before the API serves and add health-aware dependencies.
- [ ] Add safe environment bootstrap and sample-event scripts.
- [ ] Add least-privilege GitHub Actions jobs for backend, frontend, and containers.
- [ ] Add deterministic Playwright happy-path coverage.
- [ ] Validate image builds and `docker compose config`.
- [ ] Run Compose from an empty database and verify health endpoints.
- [ ] Inspect and commit the phase.

Acceptance criteria: `docker compose up --build` exposes the complete application
at `http://localhost:8080`, with PostgreSQL persistence, API, worker, and frontend.

## Phase 6 — Documentation, screenshots, and final verification

- [ ] Complete README, security guide, roadmap, and portfolio entry in English.
- [ ] Execute the full demo scenario, including skip, failure/retry, isolation, and rotation.
- [ ] Capture non-sensitive screenshots from the working application when possible.
- [ ] Run all backend, frontend, browser, migration, container, diff, link, and secret checks.
- [ ] Review tracked files and final Git history; commit documentation.
- [ ] Create the public GitHub repository only if CLI access and all checks permit it.

Acceptance criteria: documentation matches observed behavior, core-MVP items are
complete, no secrets are tracked, and the final report distinguishes verified facts from limitations.

## Environment record

- Python: 3.12.13 available (`python3` defaults to 3.14.7)
- Node.js: 24.11.0
- npm: 11.6.1
- Docker: 29.4.1
- Docker Compose: 5.1.3
- Git: 2.50.1
- GitHub CLI: not installed
