# AutoRelay roadmap

AutoRelay is intentionally limited to one condition and one action per workflow.
The options below are candidates for future work, not commitments and not hidden
features of the current MVP.

## Near-term hardening

- Add signed delivery attempts with timestamped HMAC headers and replay guidance.
- Add per-account and per-webhook rate limits backed by a shared limiter.
- Pin validated DNS results through connection establishment and enforce network
  egress policy for stronger SSRF defense.
- Add a documented Fernet key-rotation command with dual-key migration support.
- Add delivery idempotency keys and richer retry/cancellation controls.
- Expand operational metrics, queue-latency alerts, and structured audit events.

## Workflow capabilities

- Compose multiple conditions with explicit `all`/`any` groups.
- Run multiple ordered actions with per-step outcomes.
- Add scheduled triggers with timezone-aware schedules and missed-run policy.
- Provide reviewed workflow templates for common webhook patterns.
- Add safe payload mapping using a deliberately bounded transformation language.
- Add workflow versioning, draft publication, and rollback.

## Collaboration and product features

- Add team workspaces with explicit roles and ownership transfer.
- Add email verification, account recovery, and security-event notifications.
- Add import/export with secret-free portable workflow definitions.
- Add searchable audit history and retention controls.
- Add accessibility and internationalization reviews for additional locales.

## Scale options

- Measure PostgreSQL queue behavior before changing architecture.
- If measured load requires it, separate queue storage from execution history and
  introduce a durable broker with well-defined delivery semantics.
- Add worker autoscaling, per-destination concurrency limits, and backpressure.
- Add multi-region considerations only after defining consistency and failover goals.

## Optional AI assistance

An opt-in assistant could suggest a condition or action configuration from a
plain-language description. Any future implementation should require explicit
owner review before saving, avoid sending stored secrets or payload history to a
model, clearly label generated suggestions, and keep the runtime execution path
fully deterministic without an AI dependency.
