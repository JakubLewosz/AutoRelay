# AutoRelay security model

This document describes the controls and trust assumptions of the portfolio
MVP. It is a design record, not a formal audit, penetration-test report, or
claim of production security.

## Trust boundaries

AutoRelay accepts input from three different boundaries:

1. a browser using authenticated, same-origin `/api` routes;
2. unauthenticated webhook senders possessing a workflow URL token;
3. workflow owners configuring an external HTTP or Discord destination.

Nginx is the public entry point in the Compose deployment. FastAPI validates
and persists requests. A separate worker reads claimed executions from
PostgreSQL and is the only process that performs configured outbound actions.
PostgreSQL and the encryption key are trusted infrastructure.

## Authentication and sessions

- Passwords are hashed with Argon2. Plain-text passwords are used only for the
  immediate hash or verification operation and are not persisted or logged.
- Login creates a high-entropy opaque session token. Only a SHA-256 hash of the
  token is stored in `user_sessions`; the raw value is sent as an HttpOnly cookie.
- The session cookie uses SameSite=Lax. Its Secure attribute is controlled by
  `SESSION_COOKIE_SECURE` and must be enabled whenever HTTPS is used outside
  local development.
- Sessions have an expiry time, are rejected after expiry, and are deleted on
  logout. Session activity is updated without returning the raw token in an API response.
- Browser code does not store authentication material in `localStorage`.

Authenticated state-changing requests also require an `X-CSRF-Token` value
associated with the current session. The server stores only its hash and checks
it using constant-time comparison. Client-side validation is not treated as a
security boundary.

## Authorization

Every private workflow operation scopes the database query to the authenticated
user. Execution access is authorized through the execution's owning workflow.
A UUID alone is never treated as proof of access. Not-found responses avoid
confirming that another user's private resource exists.

There are no organizations, shared workflows, administrative roles, or OAuth
identities in the MVP.

## Encryption and secret handling

Sensitive workflow material is encrypted with Fernet using `FERNET_KEY` from
the environment:

- the recoverable copy of each incoming webhook token;
- generic HTTP headers and other sensitive action configuration;
- Discord webhook URLs.

Webhook verification uses a separate SHA-256 hash, so an incoming token can be
checked without decryption. Rotating a token replaces both stored forms in one
transaction and immediately invalidates the previous URL.

API responses expose only deliberately safe display fields. Blank secret inputs
on edit preserve the existing secret. Logs and execution results must not
contain passwords, cookies, session or CSRF tokens, authorization headers,
encryption keys, full webhook URLs, or unredacted action configuration. Stored
response bodies and error messages are length-bounded and sanitized.

The Compose deployment disables Nginx and Uvicorn request access logs because
the incoming webhook token is part of the URL path. Application logs should use
request IDs and structured, redacted fields instead of raw request targets.

Fernet protects database contents from disclosure without the application key;
it does not protect against compromise of both the database and the running
application environment. The MVP has no managed key rotation procedure. Losing
the key makes encrypted configuration unrecoverable.

## Incoming webhook security

- Each workflow gets a cryptographically random, capability-style token.
- The workflow UUID and token must both match an enabled workflow.
- Rotation revokes the old token immediately.
- The endpoint accepts JSON only and enforces `WEBHOOK_MAX_PAYLOAD_BYTES`
  (65,536 bytes by default) before creating an execution.
- Valid requests are durably queued and receive HTTP 202; external actions do
  not run inside the public request.
- Input payloads are treated as untrusted data and the frontend displays them
  through a text/JSON view, never as raw HTML.

Possession of a webhook URL authorizes event submission. The MVP does not add
sender signatures, replay prevention, per-source allowlists, or a distributed
rate limiter, so URLs must be treated as secrets.

## Outbound HTTP and SSRF controls

Generic HTTP actions use a default-deny validation path:

- only `http` and `https` schemes are accepted;
- embedded URL credentials are rejected;
- localhost names and loopback targets are rejected;
- resolved private, link-local, multicast, reserved, and unspecified addresses
  are rejected;
- redirects are disabled, preventing a validated public URL from redirecting
  the client to an internal target;
- connect and request timeouts are bounded;
- only a bounded response summary is stored;
- 2xx responses succeed, 429 and 5xx responses are retryable, and most other
  4xx responses fail without automatic retry.

Private destinations can be allowed only with the explicit
`ALLOW_PRIVATE_ACTION_TARGETS=true` development/test override. It is `false` in
the generated environment and must remain false for an Internet-facing deployment.

Hostname validation and connection are separate operations in ordinary HTTP
client stacks. DNS answers can change between them, and complex proxy or network
configurations can alter the effective route. The checks therefore reduce but
cannot completely remove DNS-rebinding or time-of-check/time-of-use risk. A
production design should add network egress policy or a dedicated resolving
transport that pins the validated address.

## Discord actions

Discord destinations are validated separately. The URL must use HTTPS, a
recognized Discord webhook host, and the expected webhook path shape. General
HTTP destination rules are not used as a reason to accept lookalike domains.
Message rendering supports bounded `{{ dotted.path }}` substitutions only; it
does not evaluate Python, JavaScript, or arbitrary expressions.

Automated tests mock outbound requests and do not send real Discord messages.

## Queue and retry behavior

Workers claim eligible PostgreSQL rows inside transactions using row locking
with `SKIP LOCKED`. This prevents two normal workers from claiming the same row
at once. Retryable failures use bounded exponential backoff and a small maximum
attempt count. Clearly stale `running` executions can be recovered after a
configured timeout.

Executions currently reference their workflow instead of storing an immutable
configuration snapshot. An event that is already queued uses the condition and
action configuration present when a worker claims it, and disabling a workflow
does not cancel events already accepted with HTTP 202. This makes configuration
changes immediately effective but means operators should drain or review queued
work before changing a sensitive destination. Immutable workflow versions are a
future hardening option.

These controls do not provide exactly-once delivery. A process or network can
fail after the target accepted an action but before AutoRelay recorded success.
Targets should use the non-secret AutoRelay execution identifier as an
idempotency aid where possible.

## Browser and API protections

- Production-style browser traffic is same-origin through Nginx `/api` proxying.
- CORS origins are restricted by configuration rather than using a wildcard.
- Nginx sets conservative security headers and does not render user payloads.
- Request IDs tie structured errors to server logs without returning stack traces.
- Pydantic schemas and service-layer validation remain authoritative; React and
  Zod validation are usability measures only.
- Condition evaluation traverses JSON object keys and fixed operators. No `eval`,
  user-controlled shell command, or user-derived filesystem operation is used.

## Deployment responsibilities

Before exposing an instance beyond a developer workstation:

- terminate TLS and set `SESSION_COOKIE_SECURE=true`;
- replace all development credentials and keep `.env` out of images and source control;
- limit database and worker network reachability;
- add external rate limiting and request monitoring;
- back up PostgreSQL and test restoration;
- define Fernet key backup and rotation procedures;
- review target egress at the network layer;
- run dependency, container, and application security testing.

AutoRelay intentionally does not claim that these operational controls are
provided by the local Compose setup.
