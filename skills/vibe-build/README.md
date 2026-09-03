# vibe-build

Drives an idea or a `docs/` package to a production-ready fullstack
application. Reads `docs/` + `prd.json` (generating them via `vibe-docs`
first if missing) and runs the ralph loop: a fresh headless agent instance
implements ONE small story per iteration, gated by quality/security
checks, until every story passes.

Full product, not an MVP — real database, real auth, real integrations,
tests, security hardening, Docker/CI. Hands-free: no clarifying questions,
never ships mock/dummy/hardcoded data.

## Use when

"build the app", "implement it", "code it now", "make it production
ready", "create the fullstack application".
