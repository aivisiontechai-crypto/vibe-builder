# vibe-builder

> Idea-to-production-app pipeline for AI coding agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Turn a one-line app idea into a complete, production-ready fullstack application — hands-free, with zero human interaction during the build. Works with [Claude Code](https://claude.ai/code), [opencode](https://opencode.ai), [Cursor](https://cursor.sh), [Codex](https://openai.com/codex), and any agent supporting the [Agent Skills](https://agentskills.io/) format.

**Repo:** [`aivisiontechai-crypto/vibe-builder`](https://github.com/aivisiontechai-crypto/vibe-builder)

## How it works

```
Your idea → prompt-architect → vibe-docs → vibe-build (ralph loop) → production app
```

1. **prompt-architect** briefs the raw idea into a research-oriented prompt.
2. **vibe-docs** generates a complete `docs/` package — BRD, PRD, architecture, data model, API spec, design, security plan, test plan, deployment runbook.
3. **vibe-build** reads those docs and drives the **ralph loop** — an autonomous build loop that spawns fresh headless AI agent instances, each implementing one small user story per iteration, until every story passes.
4. **vibe-evolve** keeps the toolchain fresh by refreshing installed skills and hunting for better ones.

## Available Skills

### builder

End-to-end idea-to-production-app orchestrator. Chains `vibe-docs` -> `vibe-build`. This is the main entry point — use the `/builder <idea>` slash command to kick off the full pipeline.

### vibe-docs

Turns a raw idea into full product/engineering docs (BRD, PRD, architecture, data model, API spec, DESIGN.md, security plan, test plan, deployment runbook).

### vibe-build

Reads `docs/` + `prd.json` and drives the ralph build loop to produce a complete, production-ready fullstack application.

### vibe-evolve

Self-improvement loop: refreshes installed skills and hunts for better ones for every phase of the builder pipeline.

### ralph (bundled driver, not a skill)

The ralph build-loop drivers are bundled **inside the `vibe-build` skill** at `skills/vibe-build/ralph/`, so they travel with `npx skills add`. Use `ralph-runner.mjs` as the OS-agnostic entry point on Windows, macOS, and Linux; the `.sh` driver, iteration, and heartbeat scripts remain for POSIX compatibility. The runner auto-detects and dispatches to `opencode`, `claude`, or `codex` — whichever headless CLI is found on PATH — recording the choice in `scripts/ralph/.backend` per project so it never switches CLIs mid-build.

## Installation

Install all four skills:

```bash
npx skills add aivisiontechai-crypto/vibe-builder
```

Install a single skill:

```bash
npx skills add aivisiontechai-crypto/vibe-builder --skill builder
```

**Manual install (Claude Code):**

```bash
cp -r skills/builder ~/.claude/skills/
cp -r skills/vibe-docs ~/.claude/skills/
cp -r skills/vibe-build ~/.claude/skills/
cp -r skills/vibe-evolve ~/.claude/skills/
cp -r commands ~/.claude/commands/
```

**Manual install (opencode):**

```bash
cp -r skills/builder ~/.config/opencode/skills/
cp -r skills/vibe-docs ~/.config/opencode/skills/
cp -r skills/vibe-build ~/.config/opencode/skills/
cp -r skills/vibe-evolve ~/.config/opencode/skills/
cp -r commands ~/.config/opencode/commands/
```

## Set up ralph

`vibe-build` needs the ralph driver in each project it builds. It resolves it
in this order (`vibe-build/SKILL.md`):

1. `~/.agents/ralph/scripts/ralph/` — machine-wide install (reused across
   projects; the common case once you've run a build before). **This is the
   reliable, recommended path.**
2. the copy bundled inside the `vibe-build` skill —
   `<vibe-build-skill>/ralph/` — ships with `npx skills add ...` and works
   out of the box on a fresh machine, no extra step needed.
3. clone upstream `snarktank/ralph` and adapt it — last-resort slow path.

<!-- -->
Because the driver is bundled **inside the `vibe-build` skill**
(`skills/vibe-build/ralph/`), `npx skills add` carries it along — so a fresh
`vibe-build` build works out of the box with **no extra step** (resolution
path #2).

The optional `bin/ralph-setup.sh` script is purely an optimization: it
installs the driver **machine-wide** to `~/.agents/ralph/` so future projects
reuse path #1 instead of re-bundling the driver into every project's
`scripts/ralph/`. Run it **once**:

```bash
# clone once (anywhere), then install ralph machine-wide
git clone https://github.com/aivisiontechai-crypto/vibe-builder.git
cd vibe-builder
./bin/ralph-setup.sh            # -> ~/.agents/ralph/scripts/ralph/
# or to a custom location
./bin/ralph-setup.sh /custom/path
```

This copies the driver to `~/.agents/ralph/scripts/ralph/` and makes the
scripts executable. After that, every project you build will reuse this —
resolution path #1. Verify with:

```bash
ls ~/.agents/ralph/scripts/ralph/
```

> If you skip `bin/ralph-setup.sh`, `vibe-build` simply uses the bundled
> copy inside the skill (path #2) and falls back to cloning upstream
> `snarktank/ralph` (path #3) only when the bundled copy is somehow absent.
> Both work; the setup script is the machine-wide convenience, not a
> requirement.

## Slash command

A `/builder` slash command delegates straight to the `builder` skill. It ships in two places so every install path picks it up:

1. `skills/builder/commands/builder.md` — bundled inside the `builder` skill so `npx skills add` installs the `/builder` command together with the skill itself. Claude Code reads commands from `.claude/skills/<name>/commands/` and exposes them as `/<command>`.
2. `commands/builder.md` — also shipped at the repo root so opencode (which only reads commands from `.opencode/commands/`, not from inside `skills/`) picks it up after the manual install steps above.

Both files are identical; pick whichever install path you used. Result on every supported host: `/builder <idea>`.

## Skill Structure

Each skill contains:

- `SKILL.md` - Instructions for the agent (required, `name:`/`description:` frontmatter)
- `README.md` - Human-readable overview

## Requirements

- **One headless AI agent CLI** on PATH: `opencode`, `claude` (Claude Code), or `codex` (OpenAI Codex CLI) — the ralph driver auto-detects which one is available
- `jq` — JSON parsing (required by the legacy POSIX ralph scripts)
- Node.js 18+ — cross-platform ralph runner (`ralph-runner.mjs`)
- `git` — version control and memory between iterations
- `npx` — for skill installation
- `docker` — for local Postgres and Strix pentest sandbox

On Windows, use the Node runner from PowerShell; Git for Windows or WSL is
only required when using the legacy `.sh` compatibility scripts.

See `skills/builder/SKILL.md` Prerequisites for the full list.

## License

[MIT](LICENSE)
