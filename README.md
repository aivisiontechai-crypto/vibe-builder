# Builder Pipeline Skills

Idea-to-production-app pipeline for AI coding agents (Claude Code, opencode,
Cursor, and any agent supporting the [Agent Skills](https://agentskills.io/)
format).

## Available Skills

### builder

End-to-end idea-to-production-app orchestrator. Chains `vibe-docs` -> `vibe-build`.

### vibe-docs

Turns a raw idea into full product/engineering docs (BRD, PRD, architecture,
data model, API spec, DESIGN.md, security plan, test plan, deployment runbook).

### vibe-build

Reads `docs/` + `prd.json` and drives the ralph build loop to produce a
complete, production-ready fullstack application.

### vibe-evolve

Self-improvement loop: refreshes installed skills and hunts for better ones
for every phase of the builder pipeline.

### ralph/ (bundled driver, not a skill)

`ralph/scripts/ralph/` ships the ralph build-loop driver (`ralph-opencode.sh`
/ `ralph-driver.sh`, `ralph-iteration.sh`, `ralph-heartbeat.sh`,
`OPENCODE.md`) so `vibe-build` is self-contained on a fresh machine even
without a pre-existing `~/.agents/ralph/` install. The driver auto-detects
and dispatches to `opencode`, `claude`, or `codex` — whichever headless CLI
is found on PATH — recording the choice in `scripts/ralph/.backend` per
project so it never switches CLIs mid-build.

## Installation

Install all four skills:

```bash
npx skills add <owner>/<repo>
```

Install a single skill:

```bash
npx skills add <owner>/<repo> --skill builder
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

## Slash command

A `/builder` slash command ships under `commands/builder.md` and delegates
straight to the `builder` skill, so any host that supports the Agent Skills
format plus slash-command files (Claude Code, opencode, Cursor, Windsurf,
Codex) gets `/builder <idea>` for free after install. With `npx skills add`
the command is picked up automatically; with a manual install copy the
`commands/` directory to the host's commands root (see above).

## Skill Structure

Each skill contains:

- `SKILL.md` - Instructions for the agent (required, `name:`/`description:` frontmatter)
- `README.md` - Human-readable overview

## Requirements

`vibe-build`'s ralph loop shells out to the `opencode` CLI as a subprocess
regardless of which editor hosts the skill — `opencode` must be on `PATH`
and authenticated (`opencode auth list`). See `skills/builder/SKILL.md`
Prerequisites for the full list.

## License

MIT
