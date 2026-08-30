# Repository guidance

- Work only inside this AutoRelay repository. Never inspect or modify adjacent repositories.
- Keep all source, documentation, UI copy, commits, and metadata in English.
- Treat `docs/implementation-plan.md` as persistent project memory and update it after each phase.
- Do not weaken tests to make them pass and never claim an unexecuted check succeeded.
- Keep route handlers thin; place domain behavior in services.
- Never log or return passwords, cookies, session tokens, CSRF secrets, encryption keys,
  authorization headers, full webhook tokens, or full action secrets.
- Never use `eval`, user-controlled shell commands, or user-derived filesystem paths.
- Preserve the intentionally limited MVP: at most one condition and exactly one action per workflow.
- Before a phase commit, inspect the diff, run relevant checks, and ensure `.env` remains ignored.
