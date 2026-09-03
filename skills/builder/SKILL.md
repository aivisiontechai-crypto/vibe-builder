---
name: builder
description: End-to-end idea-to-production-app orchestrator. Use when the user invokes the builder ("builder: <idea>", "use the builder", "/builder <idea>", "turn this idea into an app", "take this idea to production", "make <app> hands-free") or paste a one-line app idea and expects the full pipeline. Briefs the raw idea via prompt-architect into a research-oriented prompt, then chains vibe-docs (brief -> complete docs/) then vibe-build (docs -> production-ready fullstack app). Non-negotiables: hands-free (zero clarifying questions), no mock/dummy/hardcoded data, real DB + real auth + real integrations, all security measures, production readiness. Do NOT start coding until vibe-docs has produced docs/.
---

# builder — idea → production-ready app, hands-free

Orchestrator. Execute the pipeline below and let the two specialized skills
own their phases. Do not invent parallel work that duplicates them.

## Guard

If there is NO idea/context to build (empty `$ARGUMENTS` or an empty
scaffold dir with no docs), stop immediately and reply "give me an idea to
build — /builder <app idea>". Never fabricate a product the user didn't
ask for, and never guess a target project mid-build — the target is
announced before work starts (see Project/boundary rules).

**Existing-project collision check (hands-free does not mean destructive):**
before writing anything, check the target directory for a `docs/` or
`prd.json` that predates this idea (different `project` name in `prd.json`,
or a `DECISIONS.md`/`PRD.md` whose content doesn't match the new idea). If
found and it looks like a DIFFERENT product, do NOT overwrite it — instead
scaffold a fresh sibling directory (kebab-case name derived from the idea,
suffixed `-2`/`-3`... on collision) and say so in the target-announcement
line (see Project/boundary rules). Only resume in-place when the existing
`docs/`/`prd.json` clearly describes the SAME idea — that is the Resume
path (see Project/boundary rules), not a rebuild.

## Prerequisites (verify before Phase 0 — fail fast, not hours in)

- **Binaries on PATH**: `jq`, `git`, `npx`, `docker` (local Postgres +
  the Strix sandbox both need it), plus AT LEAST ONE headless-capable
  build-agent CLI (see "Headless build-agent backend" below — `opencode`
  is not a hard requirement, it's just the first-preference backend when
  present). Missing any of the fixed four is a hard stop with the exact
  install command for the user's OS (detect via `uname`; macOS → `brew`,
  Debian/Ubuntu → `apt`, other Linux → name the distro's own manager,
  never assume `brew` on Linux) — never start a multi-hour run destined
  to fail on a missing tool.
- **Headless build-agent backend (auto-detected, agent-agnostic)**: the
  ralph loop (Phase 2) needs ONE CLI capable of a non-interactive,
  tool-using run. Detect in this preference order and use the FIRST one
  found — never prompt, never assume opencode is the only option:
  1. `opencode` — `opencode run --auto "<prompt>"`
  2. `claude` (Claude Code) — `claude -p "<prompt>" --dangerously-skip-permissions`
  3. `codex` (OpenAI Codex CLI) — `codex exec "<prompt>"`
  4. any other CLI the user names explicitly with a working non-interactive
     flag (record its invocation the same way)
  Record the detected backend once in `scripts/ralph/.backend` (plain
  text, e.g. `opencode`) so every iteration — and any later resume/
  relaunch — uses the SAME backend instead of redetecting (and possibly
  switching) mid-build. If none of the above are found, stop and report
  which CLIs to install; never fall back to a purely-interactive tool for
  an unattended multi-hour loop.
- **Docker daemon is actually up**, not just on PATH: `docker info`
  must succeed. `docker` present but the daemon stopped fails deep into
  Phase 2 (Postgres/Strix sandbox) otherwise — catch it here instead.
- **No port collision with sibling stacks**: this environment routinely
  runs multiple `docker-compose` stacks side by side (other projects'
  Postgres/Redis/app containers, an existing local AI gateway, etc.) —
  before scaffolding this project's own `docker-compose.yml`, check
  `docker ps --format '{{.Ports}}'` (or `lsof -iTCP -sTCP:LISTEN -P` as a
  fallback) for every port this project's compose file is about to bind
  (Postgres, the app's dev/prod port, any cache/queue). On a collision,
  do NOT silently reuse the busy port — pick the next free port in the
  same family (e.g. `5432→5433`), record the remap in `docker-
  compose.yml` AND `.env.example`/`README.md` so the deviation from the
  framework default is visible, not a mystery when someone else's stack
  breaks or this one refuses to start. A build that only gets discovered
  as port-conflicted deep into Phase 2 (container fails to bind) wastes
  a multi-hour run on something checkable in seconds here.
- **The detected backend is authenticated non-interactively and a model
  responds**: for `opencode`, `opencode auth list` shows a provider that
  is API-key-based (never one requiring an interactive OAuth/browser flow
  — hands-free cannot pause on a login page); for `claude`/`codex`, the
  equivalent is a non-interactive API-key env var already set (e.g.
  `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` or this stack's OmniRoute-routed
  equivalents), never an interactive login prompt. Whichever backend was
  detected, run its trivial smoke-test invocation (`opencode run --auto
  "reply ok"` / `claude -p "reply ok" --dangerously-skip-permissions` /
  `codex exec "reply ok"`) within a short timeout (e.g. 60s — a hang here
  means the gateway is down, not that the model is slow). If this fails,
  stop and report the auth/gateway step needed — every ralph iteration
  depends on it.
- **Local AI gateway is healthy**, when one is in play (e.g. OmniRoute in
  this stack): `curl -sf <gateway>/v1/models` succeeds. A dead gateway or
  a corrupted backing store (e.g. OmniRoute's `SQLITE_CORRUPT`, see the
  project's own runbook) fails every ralph iteration identically — surface
  it here as a named infra problem, not 200 iterations of the same opaque
  API error.
- **No other builder run targets this project.** Check for a live
  `scripts/ralph/.ralph.pid` (process still running) before writing
  anything. If found, do not start a second run against the same
  directory — races on `prd.json`/git state corrupt both. Report the
  existing PID and stop; the user decides whether to wait or kill it.
- **Enough disk for a multi-hour run**: Docker images, `node_modules`,
  Postgres data, and up to 200 iterations of logs all land on disk before
  this is done. A few free GB is not a real check — fail fast here if
  free space is critically low (e.g. < 2GB) rather than discovering it
  mid-run as a cryptic Docker pull failure or a truncated log write.
- **Required skills are installed** — see Dependency install below; this
  runs automatically as part of Phase 0, never assumed silently.

## Dependency install (runs inside Phase 0, before the toolchain refresh)

**Host-agnostic skill discovery**: this SKILL.md follows the generic Agent
Skills convention (`name:`/`description:` frontmatter + markdown body) — it
and its sibling skills (`vibe-docs`, `vibe-build`, `vibe-evolve`) are
discovered from whichever directory the CURRENT host agent uses, since the
same project is opened in different editors at different times: Claude
Code reads project-level `.claude/skills/` and user-level `~/.claude/skills/`;
opencode reads `~/.config/opencode/skills/` and any path listed in its
`skills.paths` config (e.g. `~/.opencode/skills/`); Cursor/Windsurf/Codex/
Cline read their own equivalents. **Check all of the following roots for
every required skill, in this order, and treat a skill as installed the
moment it's found in ANY one of them** — never assume one host's directory
convention and miss a skill that's actually present under another's:
`.claude/skills/`, `~/.claude/skills/`, `~/.config/opencode/skills/`,
`~/.opencode/skills/` (the design-system family lives here), and
`~/.agents/skills/` (the shared ecosystem catalogued in
`~/.agents/skills/LEDGER.md` `installed:` — this root is host-agnostic by
convention and is where most Required skills below actually live).
Required skills: `prompt-architect`, `find-skills`,
`design-taste-frontend`, `ui-ux-pro-max`, `impeccable`, `frontend-design`,
`emil-design-eng`, `building-components`, `shadcn`, `magic-ui`, `agent-elements`,
`codebase-design`, `domain-modeling`, `improve-codebase-architecture`,
`gdpr-data-handling`, `security-review`, `owasp-top-10-testing`, `sast-configuration`,
`nodejs-backend-patterns`, `k6`, `seo`, `email-best-practices`, `react-email`,
`prisma-database-setup`, `prisma-postgres`, `prisma-client-api`,
`api-and-interface-design`, `test-driven-development`,
`prompt-engineering-patterns`, `agent-browser`,
`browser-testing-with-devtools`, `security-and-hardening`,
`web-app-penetration-testing`, `penetration-testing-with-strix`,
`fix-security-vulnerabilities-with-strix`, `code-review-and-quality`,
`observability-and-instrumentation`, `ci-cd-and-automation`,
`shipping-and-launch`, `vercel-react-best-practices`,
`frontend-ui-engineering`, `web-design-guidelines`,
`vercel-composition-patterns`, `debugging-and-error-recovery`,
`git-workflow-and-versioning`, `context-engineering`,
`constraint-driven-development`, `doubt-driven-development`,
`spec-driven-development`, `idea-refine`, `planning-and-task-breakdown`,
`documentation-and-adrs`, `source-driven-development`,
`vercel-optimize`, `vercel-react-view-transitions`.

1. **Check** each name against the three search roots for a directory with
   a valid `SKILL.md` (`name:` + `description:` frontmatter present).
2. **Install what's missing**, non-interactively:
   `CI=1 npx -y skills add <owner/repo>@<skill> -g -y`, using the source
   already recorded in `~/.agents/skills/LEDGER.md`'s `installed:` block
   (e.g. `vercel-labs/agent-skills@vercel-react-best-practices`,
   `Leonxlnx/taste-skill@design-taste-frontend`, `anthropics/skills@frontend-design`,
   `emilkowalski/skills@emil-design-eng`, `vercel/components.build@building-components`,
   `shadcn-ui/ui@shadcn`, `magicuidesign/magicui@magic-ui`,
   `21st-dev/agent-elements@agent-elements`,
   `mattpocock/skills@codebase-design`, `mattpocock/skills@domain-modeling`,
   `mattpocock/skills@improve-codebase-architecture`,
   `wshobson/agents@gdpr-data-handling`,
   `getsentry/skills@security-review`, `usestrix/strix@owasp-top-10-testing`,
   `wshobson/agents@sast-configuration`, `wshobson/agents@nodejs-backend-patterns`,
   `grafana/skills@k6`,
   `addyosmani/web-quality-skills@seo`,
   `resend/email-best-practices@email-best-practices`, `resend/react-email@react-email`,
   `usestrix/strix` for the
   three pentest skills). A skill with no recorded source yet must first
   pass `find-skills`' verification bar (reputable source OR ≥1k installs
   + ≥100 stars; read the SKILL.md before trusting it) — never
   auto-install an unverified skill just to unblock a run. This step runs
   arbitrary third-party code non-interactively (`-y`, no confirmation) —
   pin what you can (a tagged ref/commit if the ledger recorded one, not
   a moving branch), and never widen the trust bar just because a run is
   blocked; a failed verification is a stop for that skill (see step 4),
   not a reason to lower the bar.
3. **Re-verify** after install: directory exists, frontmatter valid.
   Append what was installed to `~/.agents/skills/LEDGER.md`'s
   `changeLog` (the same ledger vibe-evolve maintains) so this is never a
   silent, unaudited change. **Concurrency:** this file is shared across
   every project's builder run — a second run against a DIFFERENT
   project directory is explicitly allowed (see the Prerequisites lock,
   which only guards the SAME project) and may be appending at the same
   moment. Wrap the append in `flock` against a sidecar lock file (e.g.
   `flock ~/.agents/skills/LEDGER.md.lock -c '...append...'`) so two
   concurrent runs never interleave writes into the same line/section.
4. **A skill that fails verification is a hard stop for THAT skill's
   phase only** — degrade explicitly (e.g. "security-and-hardening
   unavailable, skipping the final security pass — fix before shipping")
   rather than silently proceeding as if the non-negotiable it backs was
   satisfied.

## Pipeline

0. **Phase 0 — dependencies + toolchain check.**
   Run the Dependency install pass above first (hard requirement, not
   cadence-gated — a missing skill blocks its phase regardless of when
   skills were last checked). Then run the `vibe-evolve` skill for
   self-improvement: it refreshes installed skills, uses `find-skills` to
   hunt better ones for pipeline gaps, and installs only verified
   candidates. Honor its cadence gate — it skips itself if checked within
   the last 14 days (the dependency-install pass above is NOT subject to
   this gate). This is where the pipeline improves itself; never skip the
   explicit "evolve now" request. **Cadence override:** if step 4 of the
   Dependency install pass above logged 2+ skill verification failures in
   this run, treat that as evidence something regressed upstream and run
   `vibe-evolve` regardless of the 14-day gate — a stale skill is worse
   than an extra check.
1. **Phase 1 — brief: run the `prompt-architect` skill, then docs: run the
   `vibe-docs` skill.**
   Load the `prompt-architect` skill (from `~/.agents/skills/`). Transform
   the raw idea into a structured, research-oriented prompt/brief using a
   research-brief framework — CO-STAR or BROKE (decide per idea; the brief
   must expose audience, context, objective, and measurable success so the
   docs write themselves). Answer the framework's clarifying dimensions
   YOURSELF from the idea — hands-free means no clarifying dialogue; the
   skill's progressive-disclosure is for humans, use its structure only.
   First persist it: write the brief to `<target>/BRIEF.md` — the framework
   used and the research dimensions (audience, context, objective,
   measurable success, constraints) — so vibe-docs and every ralph
   iteration cite the same source. Then feed that brief into `vibe-docs`
   as the idea. The user's idea goes in; a
   complete `docs/` package comes out (BRD, PRD,
   ARCHITECTURE, DATA_MODEL, API_SPEC, DESIGN.md, SECURITY, TEST_PLAN,
   DEPLOYMENT, SCOPE, DECISIONS.md) plus `prd.json` at the project root —
   the FULL product split into small ralph stories (not an MVP cut; every
   feature in scope, only ordered). No questions asked, every assumption
   recorded in `docs/DECISIONS.md`. vibe-docs names `idea-refine` and
   `spec-driven-development` as its rigor backbone and `planning-and-
   task-breakdown` for splitting the PRD into small ordered stories —
   these are Required skills here specifically so Phase 0 guarantees they
   exist rather than vibe-docs silently degrading when they're absent.
   Load `documentation-and-adrs` for how `docs/DECISIONS.md` records each
   assumption — it's the same "future engineer/agent needs this context"
   problem that skill is built for.
   - **Completeness gate before Phase 2** (don't just trust the phase
     finished): confirm every required file exists and is non-empty —
     `README.md`, `BRD.md`, `PRD.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`,
     `API_SPEC.md`, `DESIGN.md`, `SECURITY.md`, `TEST_PLAN.md`,
     `DEPLOYMENT.md`, `SCOPE.md`, `DECISIONS.md`, `CHANGELOG.md`,
     `TROUBLESHOOTING.md` under `docs/` — the same
     list Phase 1 promises above, kept in sync with it — AND `prd.json`
     passes the same ralph-shape check the driver itself enforces (`jq -e
     '.project and .branchName and (.userStories | length > 0)'`). If
     vibe-docs died partway (crashed session, killed process) and any file
     is missing, do NOT launch ralph against a partial contract — re-run
     vibe-docs (or the missing piece of it) before Phase 2, and never let
     e.g. a missing `SECURITY.md` mean ralph builds auth/threat-model
     decisions nobody actually specified.
2. **Phase 2 — build: run the `vibe-build` skill, which runs the ralph
   loop.**
   Install the ralph driver (`~/.agents/ralph/scripts/ralph/` →
   `<project>/scripts/ralph/`) and launch `ralph-opencode.sh` in the
   **background** (`nohup ... > scripts/ralph/ralph.log 2>&1 &`), then
   poll `prd.json` (`passes`), `progress.txt`, and `ralph.log`. Each
   iteration spawns a fresh headless opencode instance that implements ONE
   small story; quality checks gate every commit; the loop stops itself on
   `<promise>COMPLETE</promise>` when every story passes. Each fresh
   instance has NO memory of prior iterations beyond what's on disk — load
   `context-engineering` when writing/refreshing `scripts/ralph/OPENCODE.md`
   (the per-iteration prompt) so every iteration is pointed at the same
   minimal, high-signal set (docs/, `CONSTRAINTS.md`, `progress.txt` tail,
   the one open story) instead of re-deriving context inconsistently or
   drifting as the project grows. Commits follow `git-workflow-and-versioning`
   (atomic, Conventional Commits, one story per commit) so `git log` alone
   is a readable history of what ralph actually did.
   - **Budget cap (enforced by you, the supervisor):** before launching,
     record a wall-clock ceiling (default 6 hours) AND a cost ceiling
     (default: ask `opencode stats` for a recent baseline, else $20) —
     wall-clock alone misses a loop that's fast but expensive per
     iteration. Poll both, not just time, on the same cadence as
     `prd.json`. These are STALL-detection thresholds, not a hard budget
     the run must fit inside — the real constraint on a free/local model
     (e.g. OmniRoute serving free-tier models) is zero, so treat the cost
     ceiling as informational when spend is actually $0, and never let
     either ceiling alone end a run that is still making real progress.
   - **Always hands-free, and never stops on time/cost alone while
     progress continues:** hitting a ceiling never pauses to ask, and
     does NOT stop the loop by itself — check `prd.json` for stories
     still landing (`passes: false → true` within the last few
     iterations) and commits still appearing in `git log`. If progress is
     real, log the ceiling hit and extend again (repeatable, not a
     one-time exception — e.g. "6h reached, 9 stories open, still
     landing ~1/20min, extending to 9h"; "9h reached, still landing,
     extending to 12h"), and keep doing this for as long as the model
     keeps responding and stories keep passing — a continuously available
     model with no real cost constraint should run to full completion,
     not stop at an arbitrary clock/cost checkpoint. Only stop and report
     **PARTIAL** when the loop is genuinely stalled (see the stall
     diagnosis below — 3+ consecutive iterations with zero new
     `passes: true` and no commits) or a hard external failure blocks it
     (auth/gateway down, disk full) — never merely because a ceiling
     number was crossed while stories keep completing.
   - **Abort switch:** the loop can always be stopped safely with
     `kill $(cat scripts/ralph/.ralph.pid) $(cat scripts/ralph/.iteration.pid 2>/dev/null) 2>/dev/null`
     — no state is lost (git history + `prd.json` + `progress.txt`);
     re-running `ralph-opencode.sh` resumes at the next `passes: false`
     story.
   - Unblock a stuck iteration rather than re-running green stories. Load
     `debugging-and-error-recovery` for the systematic version of this
     rather than guessing: diagnose the SHAPE of the stall before
     relaunching. A 429/rate-limit response (check the log for it
     explicitly, don't lump it in with generic 5xx) needs a LONGER backoff
     than a transient error — retrying immediately just burns the new cost
     ceiling on more rejected calls; repeated identical tool/provider
     5xx/timeout errors within 2-3 iterations — back off (shorter) and
     relaunch as-is; no commits landing for 3+ clean iterations points at a
     permission deny-list (`opencode.json` `permission` rules) blocking
     headless bash/edit; a stalled but error-free iteration usually means
     the story is too big or a docs fact is missing — fix `prd.json`/docs,
     not the driver.
3. **Phase 3 — final gates before reporting.**
   - Prove the loop actually finished: `scripts/ralph/heartbeat.state`
     ends `DONE` (not `FAILED`) AND `jq -r
     '.userStories[] | select(.passes == false) | .id' prd.json` prints
     nothing. Anything else = incomplete — fix/relaunch, or if the budget
     cap (Phase 2) was hit, report explicitly as **PARTIAL** (stories done
     vs. remaining) — never report a partial build as shipped.
   - **Clean-DB migration check**, before trusting the app: run
     `prisma migrate deploy` (or equivalent) against a FRESH database, not
     the dev DB the ralph loop mutated across every iteration — a drifted
     dev DB can hide a broken migration chain that only surfaces on a real
     deploy. Fix and re-verify before proceeding; a green dev DB with a
     broken migration chain is not production-ready.
   - **Backup/restore exercise** (vibe-build's disaster-recovery gate):
     actually run one backup + restore cycle against a scratch database
     this run and confirm real row counts, not just a green exit code —
     record the recovery procedure/owner in `docs/DEPLOYMENT.md` if not
     already there.
   - **CI/CD staging + smoke test**: confirm the pipeline's staging-deploy
     stage runs and its smoke test (health check + one critical user
     journey over real HTTP) actually passes against the staging deploy
     before anything promotes to production in the pipeline config —
     don't just read the YAML and assume the stage works.
   - Run the no-mock-data gate + security minimums from vibe-build.
   - Run the Strix runtime pentest gate from vibe-build against the running
     app: a clean run, or every validated finding fixed and the re-run
     clean, before reporting shipped. Treat any non-zero exit as needing
     triage via `strix view <run>` — don't assume a fixed exit-code
     meaning. Strix uses the SAME OmniRoute models as this agent
     (`STRIX_LLM=openai/auto`, `LLM_API_BASE=http://localhost:20128/v1`).
     **Triage-loop bound:** cap fix→re-scan cycles at 3, matching ralph's
     own stall detector. If a finding still isn't clean after 3 rounds,
     stop looping — record it (severity, what was tried, why it's still
     open) so Phase 4 reports it explicitly; a build with an unresolved
     Strix finding is never reported as fully security-gated, even if
     every user story otherwise passed.
   - **Run vibe-build's section 6c Final checklist validation pass, item
     by item, against the actual running app/codebase — not from memory
     of what was written earlier.** Run this AFTER the Strix gate above,
     since one of its checked items is "Strix pentest run and clean" —
     running it earlier would fail that item on ordering alone, not on a
     real gap. For each of the checked items (see vibe-build section 6c
     for the current authoritative list — auth, session/token lifecycle,
     IDOR/admin/tenant-isolation tests, input validation, file uploads,
     SSRF, rate limiting, payments/webhooks, fail-closed errors, secrets,
     dependency scanning, named security headers, client-side/browser
     XSS + token-storage, accessibility, pages/UX-state audit, UI polish
     (motion/reduced-motion, real/Pollinations-generated images with alt
     text committed locally, allowlisted remote image hosts, next/font),
     SEO/PWA (Metadata API, sitemap.xml, robots.txt, favicon/manifest),
     feedback/loading states (toasts, skeletons/Suspense, error.tsx
     boundaries), performance budget (Core Web Vitals), Strix,
     no-mock-data): mark it
     pass or fail with the concrete
     evidence checked (command run, file read, test executed) — never a bare "looks fine." Any FAIL is fixed
     immediately, in this same phase, then that single item is
     re-verified before moving to the next — do not batch fixes and
     re-check everything at the end, since a fix for one item can
     regress another already-passed item. Cap
     total fix→re-verify rounds at 3 per item, matching the Strix
     triage-loop bound above; an item still failing after 3 rounds is
     recorded (what failed, what was tried, why it's still open) and
     reported explicitly in Phase 4 as a known gap — never silently
     dropped or reported as passing. Produce a compact status table
     (item → PASS/FAIL/FIXED) to include in the Phase 4 report.
   - Load `code-review-and-quality` and `security-and-hardening` for a last
     pass over the diff — fix everything CRITICAL/HIGH before done. If
     either skill failed the Dependency install verification, say so
     explicitly instead of silently skipping the pass.
   - **Adversarial pre-ship review**: load `doubt-driven-development` for
     this gate specifically — production, security-sensitive, and a local
     merge to the default branch are exactly the stakes that skill targets.
     Review the diff and this checklist itself with a fresh, skeptical pass
     rather than rubber-stamping 200 iterations of self-reported green.
   - Browser-verify core flows; if no browser tool is available, verify via
     running server + HTTP checks + green build and say so.
   - **Performance pass**: load `vercel-optimize` against the running app
     (Core Web Vitals, caching, unnecessary client bundles/function
     invocations) before calling this production-ready — "green build"
     alone doesn't catch a slow, expensive-to-run app.
   - **Load test**: run the installed `k6` skill (vibe-build's Load &
     performance testing row) against the core API endpoints (auth,
     primary CRUD path, AI chat) and record real p95/p99 latency and
     error-rate numbers — a passing build with no load test is not
     proven scalable, only proven to work for one request at a time.
   - **Integration connection-status check** (if the product has any
     third-party OAuth/API integration): verify vibe-build's section
     6a5b state machine is actually implemented — force one integration
     into each reachable state (disconnect, expire, a forced provider
     error) and confirm the UI reflects it, not just that the enum column
     exists in the schema.
   - **AI agent self-audit (vibe-build section 7b)**: answer all 20
     questions for the run as a whole before writing the Phase 4 report —
     paste real command output/evidence per question, not assertions.
     Question 20 ("would you deploy this right now, unattended?") is
     answered honestly; a "no" here means the report is PARTIAL regardless
     of what `prd.json` says.
   - **Fill the final production gate table (vibe-build section 7c)**:
     every one of the 22 areas marked PASS or NO-GO from the evidence
     gathered in this phase — include this table verbatim in the Phase 4
     report. A single NO-GO row makes the overall report PARTIAL, never
     COMPLETE, even if every `prd.json` story passed.
   - **Never `git push` and never open a PR or comment on shared systems.**
     All commits stay local to the project's branch; publishing is a
     separate, explicit user request, not part of this pipeline.
   - **Postmortem (feeds vibe-evolve, never skipped even on PARTIAL):**
     append one dated entry to `~/.agents/skills/LEARNINGS.md` (create with
     a one-line header if missing) capturing what THIS run actually
     revealed, in a fixed compact shape so it's cheap for vibe-evolve to
     scan later. **Concurrency:** same shared-file risk as the LEDGER.md
     append in Phase 0 — another builder run against a different project
     may be appending to this exact file at the same time; wrap the
     append in `flock` against a sidecar lock file for the same reason.
     `- <date> <project> [COMPLETE|PARTIAL]: stalls=<n> (<dominant cause,
     e.g. rate-limit/permission-deny/oversized-story>); skill-gaps=<skill
     name(s) that underperformed or a phase that had none, or "none">;
     strix-rounds=<n, if >0 note the finding class>; checklist-fails=<6c
     items that needed a fix, or "none">; cost=<opencode stats total>`.
     Pull the values from data already gathered in this same phase (stall
     diagnosis in Phase 2, the Phase 3 status table, Strix triage rounds,
     `opencode stats`) — never re-derive or guess them. This is the ONLY
     place real run outcomes become durable, cross-project signal; without
     it vibe-evolve's gap-hunting has nothing but static phase names to go
     on.
4. **Report** (short): shipped features (or PARTIAL + remaining count),
   the Phase 3 checklist validation status table (item → PASS/FIXED, plus
   any FAIL still open after 3 rounds with what was tried), the final
   production gate table (vibe-build section 7c, all 22 areas), the load-
   test p95/p99/error-rate numbers, any unresolved
   Strix finding left open by the Phase 3 triage-loop bound
   (severity + what was tried — never omitted just because stories all
   passed), one command to run it, only the credentials the user must
   supply (env-gated, read from the credentials file — never restated
   inline), and the run's total cost/tokens (`opencode stats --days 1`) so
   the spend of an unattended run is never a surprise.

Auto-chain rule: the phases run end-to-end with NO confirmation stops.
When vibe-docs finishes, proceed straight into vibe-build — never ask
"want me to build it?". If the user walks away mid-run, keep going to
COMPLETE; the only thing ever left for them is real-account credentials
and the final report.

## Non-negotiables (never violated)

- Hands-free. Never ask the user to choose a stack, feature priority, or
  design, and never pause mid-build to ask anything — including hitting
  the Phase 2 budget/time ceiling (repeatedly auto-extended, logged each
  time, as long as stories keep passing — see Budget cap; PARTIAL is only
  reported if the loop actually stalls, never merely from crossing a
  clock/cost number). The only
  admissible deferral is real-account credentials, which are never asked
  for mid-build — they're env-gated placeholders the app runs without,
  listed in the final report for the user to fill in whenever they choose.
- Every build starts from a research-oriented brief (prompt-architect),
  never from the raw idea — the brief pins audience, context, objective, and
  measurable success before any doc or code exists.
- **The quality bar is a written contract, not a vibe.** Load
  `constraint-driven-development` in Phase 1 alongside `vibe-docs` to turn
  this section plus `docs/SECURITY.md`/`docs/TEST_PLAN.md` into a
  `CONSTRAINTS.md` the whole run is held to — coverage thresholds, banned
  suppressions (`@ts-ignore`, `eslint-disable`), no skipped/deleted tests.
  Across 200 unattended ralph iterations, a silently weakened bar (one
  iteration disables a lint rule to get to green) is the likeliest way
  "production readiness" quietly erodes — `CONSTRAINTS.md` gives every
  fresh iteration and the Phase 3 gate the same fixed bar to check against.
- FULL product, not an MVP: everything in `prd.json` ends `passes: true`,
  in priority order, in one run. Nothing is deferred by scope — only
  sequenced. If the budget cap is hit first, the honest report is
  PARTIAL, never "shipped."
- Zero mock/dummy/hardcoded data in the app (tests may mock; the app never
  does; e2e hits a real DB and the real running app).
- Real integrations for payments/email/storage/AI — provider SDK built in,
  credential env-gated, never a fake "paid"/"sent".
- Real auth (hashed passwords, httpOnly secure cookies, CSRF, server-side
  RBAC), input validation at every boundary, security headers/CSP, rate
  limits, least-privilege DB user, non-root container, secrets never
  committed, `npm audit` clean.
- **Secrets are never dumped to a log a detached run leaves on disk.** The
  bootstrap admin password (see vibe-build) goes to a gitignored,
  permission-restricted file, never to `stdout`/`build.log`/`ralph.log`.
- Production readiness is "green lint/typecheck/build + green
  unit/integration + e2e", not vibes.
- **Self-improving, within bounds.** Phase 0 (dependency install +
  vibe-evolve + find-skills) keeps the toolchain complete and fresh. What
  never happens: installing unverified skills, reinventing green stories,
  second-guessing the spec mid-build, or infinite novelty for its own
  sake.
- **Never pushes, opens PRs, or touches shared/remote systems.** Everything
  stays local until the user explicitly asks to publish.

## Project/boundary rules

- Work in the current/nearest sensible project directory. If the idea
  deserves a fresh project and the user gave no directory, scaffold one
  (git init, `.gitignore`, `.env.example`) under a short kebab-case name
  derived from the idea. **Name collision:** if that directory already
  exists and is unrelated (see Guard), suffix `-2`, `-3`, ... rather than
  writing into it.
- **Announce the target before building anything:** print one line to the
  log — `Building <idea> in <absolute path> on branch <branchname>` — and
  only then proceed. In a detached run this is the ONLY sign the project
  landed where the user wanted; a wrong guess is expensive hours later, so
  it must be visible up-front. Also write the resolved absolute path to
  `scripts/ralph/.target-path` (create the `scripts/ralph/` dir early if
  needed) — a plain marker file, not just a log line — so the
  concurrency-lock check in Prerequisites and any later builder invocation
  can resolve "what is this run building" without re-deriving it or
  parsing logs.
- **Record this supervising session's own id** in the same step, so the
  user can attach to the exact live session instead of only reading logs
  (`opencode session list` — the most recently created session with the
  matching directory/title is this one; if the launch command set
  `--title`, match on that). Append one line —
  `<timestamp>  builder-supervisor  <sessionID>  <absolute path>` — to
  `<absolute path>/.opencode-sessions.log` (create it if missing; this
  file is gitignored, see the `.gitignore` handling in vibe-build section
  4). Every ralph iteration later appends its own session id to this SAME
  file (see vibe-build section 4), so by the end it is a single
  chronological index of every opencode session this run ever spawned —
  `opencode session list` (to confirm it's a real, current session) then
  `opencode <absolute path> --session <sessionID>` against any line opens
  that exact session live in the TUI (`opencode attach <url>` is for
  attaching to a running *server*, not a session id — do not confuse the
  two), letting the user watch that exact moment of the build happen, not
  just read about it after the fact in a log.
- **Resume is automatic and cheap to check:** the prompt-architect brief
  step always runs first (it's cheap — one prompt, no docs generation) so
  there's a fresh `BRIEF.md` to compare against, THEN decide same-idea
  vs. new build:
  "Same idea" is decided in this order, cheapest/most-certain first: (1)
  exact `project` name AND `branchName` match in the EXISTING `prd.json`
  (fastest, no brief comparison needed); (2) if names differ or no
  `prd.json` exists yet, compare the freshly-generated `BRIEF.md` against
  a persisted one from a prior run in this directory — same idea only if
  the vision/target-user/core-features lines match near-verbatim, not
  just topically similar. If `docs/` + `prd.json` already exist AND this
  resolves to the SAME idea: skip regenerating `docs/`/`prd.json` (the
  rest of Phase 1, i.e. `vibe-docs` itself — that would overwrite
  recorded decisions and reset ralph's story list) and go straight to
  Phase 2, letting ralph pick up at the first `passes: false` story.
  Anything short of a same-idea match is a DIFFERENT product — fall back
  to the Existing-project collision check (Guard) and scaffold a sibling
  directory rather than guessing a resume. This is what makes "process
  died mid-run, re-run the same command" work: git history, `prd.json`,
  and `progress.txt` are the durable state, nothing is redone.
  **Phase 0 (Dependency install + cadence-gated `vibe-evolve`) still
  always runs first, even on resume** — the remaining open stories may
  need a skill the FIRST invocation never required (e.g. a payments
  story needs `prisma-client-api` but the run that only got through auth
  stories never touched it), so re-running Dependency install before
  every resumed Phase 2 is what actually satisfies "integrate any
  additional skills needed," not an assumption that whatever was
  installed last time is still enough.
- **Log growth is bounded.** `ralph.log`/`build.log` accumulate across up
  to 200 iterations of a multi-hour run. Truncate each to its last ~2MB
  (keep the tail — that's what the heartbeat and stall-diagnosis read)
  once it exceeds ~20MB, rather than letting detached-run logs grow
  unbounded on disk.
- **Git end-state is explicit.** Work happens on `ralph/<branchName>`.
  On a clean COMPLETE (not PARTIAL), attempt to merge that branch into the
  repo's default branch locally (fast-forward or a merge commit — no
  force-push, no remote touch, per the non-negotiables). If the default
  branch moved and the merge conflicts, do NOT resolve it blind: abort the
  merge (`git merge --abort`), leave `ralph/<branchName>` as-is, and say so
  plainly in the report — a silently-attempted conflict resolution on a
  production build is worse than one extra manual step for the user. A
  PARTIAL always stays on the ralph branch, unmerged, so an incomplete
  slice is never mistaken for what's on `main`.
- **Abort safely at any time:**
  `kill $(cat scripts/ralph/.ralph.pid) $(cat scripts/ralph/.iteration.pid 2>/dev/null) 2>/dev/null`
  stops the loop without losing state — the next invocation resumes per
  the point above.
- Keep a todo list across the whole pipeline and update it as phases land.
  For the build phase, track ralph's progress from `prd.json`
  (`passes: true/false` per story) and `progress.txt` — that IS your
  monitoring data; don't duplicate it.
- If the user interrupts with a new direction mid-build, finish the current
  slice, checkpoint the work, then adjust — do not restart from zero.
