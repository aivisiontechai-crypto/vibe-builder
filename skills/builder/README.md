# builder

End-to-end idea → production-ready app orchestrator that runs hands-free on any headless agent backend ([opencode](https://opencode.ai), [Claude Code](https://claude.ai/code), or [Codex](https://openai.com/codex)).

## What it does

Given a one-line app idea, `builder` runs the full hands-free pipeline:

1. **Prerequisites** — verifies the detected headless agent CLI
   (`opencode`/`claude`/`codex`), plus `jq`/`git`/`npx`/`docker`, are
   present, the Docker daemon is up, auth/AI-gateway are healthy, no other
   run targets the same project, and enough disk is free.
2. **Dependency install** — checks/installs ~35 required skills across
   all supported skill roots, non-interactively, with a verification bar for
   any unrecorded source.
3. **Phase 0** — runs `vibe-evolve` (cadence-gated toolchain refresh).
4. **Phase 1** — briefs the idea via `prompt-architect`, then runs
   `vibe-docs` to produce a complete `docs/` package + `prd.json`.
5. **Phase 2** — runs `vibe-build`, which drives the ralph loop: a fresh
   headless agent instance implements one small story per iteration.
6. **Phase 3** — final gates: clean-DB migration check, no-mock-data +
   security minimums, Strix pentest, code review, adversarial review,
   performance pass.
7. **Report** — shipped features (or PARTIAL), one command to run it,
   only the credentials the user must supply, and total run cost.

## Non-negotiables

Hands-free (zero clarifying questions), full product not an MVP, zero
mock/dummy/hardcoded data, real DB/auth/integrations, full security
hardening, never pushes or opens PRs — everything stays local until the
user explicitly asks to publish.

## Depends on

`vibe-docs`, `vibe-build`, `vibe-evolve` (siblings in this pack),
`prompt-architect`, `find-skills`, and the ~35 skills listed under
"Dependency install" in `SKILL.md`.

## Use when

"builder: \<idea\>", "use the builder", "/builder \<idea\>", "turn this
idea into an app", "take this idea to production", "make \<app\>
hands-free".
