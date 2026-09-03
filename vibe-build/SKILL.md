---
name: vibe-build
description: Use when the user wants a fullstack application built from an idea or from existing docs — "build the app", "implement it", "code it now", "make it production ready", "create the fullstack application". Reads docs/ + prd.json (ralph format) if present, otherwise generates them first via the vibe-docs skill, then drives the ralph loop (snarktank/ralph, adapted to opencode): a fresh headless opencode instance implements ONE small story per iteration until every story passes, monitored via prd.json passes and progress.txt. Builds the COMPLETE full product — NOT an MVP cut: real database, real auth, real data flows, tests, security hardening, Docker/deploy config. Hands-free: choose the best defaults, ask no clarifying questions, never ship mock, dummy, fake, or hardcoded data. Works with everything installed: impeccable, ui-ux-pro-max, design-taste-frontend, design-md, vercel-labs/agent-skills, prisma skills, agent-browser, and the addyosmani lifecycle skills.
---

# vibe-build — docs → production-ready fullstack application

Build a COMPLETE, production-grade fullstack app from an idea or from the
docs. You are the tech lead shipping v1 to production under a code freeze:
blunt, decisive, secure, zero mock data, zero questions asked.

## 0. Operating rules (non-negotiable)

- **Hands-free.** Decide with the defaults below. Ask the user NOTHING
  except where the law requires (payment provider account, real external
  SaaS API keys). For those, write the real integration code and
  env-config; only the credential is theirs to supply later. Record
  choices in `docs/DECISIONS.md`.
- **No mock, dummy, fake, or hardcoded data. Ever.**
  - No `https://jsonplaceholder.*`, no fake fetch payloads, no in-memory
    arrays masquerading as a database, no lorem-ipsum content in real
    screens, no "example.com" placeholders in seeded content.
  - Persistence is real from the FIRST slice: migrations → schema → code.
    Every screen reads live database rows.
  - Any initial content (empty states copy, curated lists, legal text,
    templates) is real, opinionated, authored content stored in the DB via
    migration or an env-scoped seed — not string literals sprinkled in UI.
  - The only bootstrap record is one admin user: generate a strong random
    password, store only its Argon2/bcrypt hash in the DB. Write the
    plaintext ONCE to a gitignored, `chmod 600` file
    (`scripts/ralph/.admin-credentials`) — never echo it to `stdout`,
    `build.log`, or `ralph.log`; detached (`nohup`) runs persist those
    streams to disk indefinitely, and a printed credential becomes a
    standing secret leak. Print it to an interactive terminal too only
    when a TTY is actually attached; the final report always points at
    the file path, never repeats the value inline.
  - No hardcoded config: every URL, secret, and switch comes from `.env`
    (gitignored), read through ONE typed env module (e.g. `src/lib/env.ts`:
    loads dotenv, Zod schema, exports a single `env` object). `.env.example`
    is the EXHAUSTIVE catalog of every runtime var — auth/encryption keys
    AND every real-account credential (Stripe, email, file storage, AI…),
    each with a comment saying where to get it — holding placeholders/empty
    values only (real values never committed).
  - **Env-gate contract** for every provider integration: read the key via
    the env module. If unset, the app STILL boots and the integration sits
    fully wired but OFF — its route/component shows a clear "set X in .env"
    notice, never crashes, never returns fake success. When the key is
    present, the real SDK path executes. Net effect: the user's only step is
    pasting credentials into `.env`; no code change, ever.
  - **Testing is NOT mock data.** Unit/integration tests may use test
    doubles and mocks (industry standard) — that is fine. What is banned is
    mock data INSIDE the application: e2e runs against a real dev database
    and the real running app.
  - **Real integrations, no stubs.** Payments, email, file storage,
    queues, AI: implement the real provider integration (Stripe, Resend/
    SES, S3/R2, provider SDK) with the provider's SDK, config via `.env`.
    A real-account-only credential is env-gated and the feature left fully
    wired — NEVER return a fake "paid", fake "sent", or stub response.
- **Blunt but robust.** If a requirement is infeasible (no real free tier,
  API needs an account), do the production-honest thing: wire the real
    integration, gate the credential in env, and say exactly what the user
    must paste. Never stub the world.
- **Vibe coding:** keep momentum, ship vertical slices that each work and
  are committed before the next starts (atomic commits, Conventional
  Commits), boring over clever, single source of truth, think-twice-
  code-once.

## 1. Input

- If `docs/` exists, read `BRD.md`, `PRD.md`, `ARCHITECTURE.md`,
  `DATA_MODEL.md`, `API_SPEC.md`, `DESIGN.md`, `SECURITY.md`, `SCOPE.md`,
  and `DECISIONS.md` (the record of every assumption).
- Read `prd.json` at the project root — the ralph task list. It is the
  contract: every story must end `passes: true`.
- If either is missing, first run the **vibe-docs** skill to produce
  `docs/` + `prd.json`, then build.

## 2. Stack (decisive default — deviate only for a hard technical reason)

- **App**: Next.js (App Router) + strict TypeScript.
- **UI**: Tailwind CSS v4 + shadcn/ui, tokens from `docs/DESIGN.md`.
- **Motion**: `motion` (motion/react, formerly Framer Motion) for React
  animation — enter/exit transitions, layout animation, scroll-triggered
  reveals, gesture-driven micro-interactions. Plain CSS transitions for
  simple, self-contained hover/focus effects; reach for `motion` once an
  interaction needs orchestration, springs, or `AnimatePresence`. Page-
  level navigation transitions use React's View Transition API
  (`vercel-react-view-transitions` skill) where the framework supports it.
  Every animation respects `prefers-reduced-motion` (reduce to opacity/
  no-motion fallback) — this is part of the accessibility gate, not
  optional polish.
- **Scroll-driven reveals**: prefer native CSS scroll-driven animations
  (`animation-timeline: scroll()`/`view()`) for simple scroll-linked
  reveals/parallax where the target browser support in
  `docs/ARCHITECTURE.md`'s audience allows it — zero JS cost, runs on the
  compositor thread, no jank from a scroll listener. Fall back to
  `motion`'s scroll hooks (`useScroll`/`useTransform`) only for effects
  the CSS primitive can't express (cross-element choreography, spring
  physics) or when broader browser coverage is required; never ship both
  for the same element.
- **Command palette** (`cmd/ctrl+K`): for any product whose nav has more
  than ~6 top-level destinations or with frequent power-user actions
  (search, create, settings), add a command palette (`cmdk` primitive,
  which shadcn/ui's `Command` component already wraps) — a real,
  keyboard-accessible index of actual routes/actions, never a decorative
  shell with no results. Skip entirely for small/simple apps — this is
  gated on real navigation complexity, not a default for every build.
- **Images**: `next/image` for every raster image (automatic
  optimization, responsive `sizes`, blur placeholder) — never a bare
  `<img>` for content images. The single largest above-the-fold image
  (hero/LCP candidate) gets `priority` (or `fetchPriority="high"` for a
  non-Next `<img>`) so it isn't lazy-loaded behind other requests — this
  is the single highest-leverage LCP fix and is verified in the
  performance pass, not just set and forgotten. Real, on-topic imagery
  only: licensed stock,
  project-generated illustrations/AI-generated art consistent with
  `docs/DESIGN.md`'s visual identity, or user-uploaded content — never a
  lorem-picsum/placeholder-service URL in a shipped screen (this extends
  the no-mock-data gate in section 5 to visual assets). Every meaningful
  image has real `alt` text; decorative images are `aria-hidden`. Any
  remote image source is an explicit `images.remotePatterns` allowlist in
  `next.config.ts` (protocol + hostname + narrowest `pathname` that works)
  — never a wildcard hostname; an open remote-image proxy is an SSRF/
  abuse vector, the same class of issue as section 6a4's server-side-
  fetch rule, just reached through `<Image src>` instead of a fetch call.
  - **Generating the imagery**: when the product needs hero art,
    illustrations, empty-state graphics, or avatar/placeholder-persona
    images and no licensed asset exists, generate them with Pollinations'
    free image endpoint (no API key) as a one-time **scaffold/build-time**
    step, not a runtime call. Use a small Node/TS script (this is a
    strict-TypeScript project — don't introduce a Python dependency for
    a one-off asset step):
    ```ts
    import { writeFile, mkdir } from "node:fs/promises";

    const prompt = "on-brand description matching docs/DESIGN.md, no text/logos";
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}` +
      `?model=flux&width=1600&height=900&nologo=true`;

    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    await mkdir("public/generated", { recursive: true });
    await writeFile("public/generated/hero.jpg", Buffer.from(await res.arrayBuffer()));
    ```
    Run this (e.g. via `npx tsx scripts/generate-image.ts` — no project
    dependency needed, `tsx` runs via `npx` on demand) once per needed
    image during scaffolding, commit the resulting file under
    `public/generated/` (or `src/assets/`), and reference it with a
    **local** `next/image` import — this sidesteps `remotePatterns`
    entirely (no remote host at runtime), survives Pollinations being
    unreachable in prod, and keeps the app's visual identity byte-for-byte
    stable across rebuilds. **This is a best-effort convenience, not a
    blocking dependency**: if the sandbox/CI environment generating it has
    no outbound network access or the endpoint is unreachable, catch the
    failure, log it, and fall back to a locally-authored SVG/gradient
    placeholder (still real, on-brand, no lorem-picsum) rather than
    failing the story or retrying indefinitely — the AI-generated image is
    a nice-to-have polish pass, never a hard gate the ralph loop can get
    stuck on. Give every generated image a real, descriptive `alt` (never
    "generated image" or the raw prompt). Treat generated art as a
    supplement to, not a replacement for, an existing `docs/DESIGN.md`
    visual direction — keep every generation prompt consistent with the
    already-chosen palette/mood so the app doesn't end up with mismatched
    art styles across screens. Pollinations is a still-image generator,
    not a video generator — for "animated" hero art, generate the still
    and animate *it* with `motion` (subtle parallax/Ken-Burns/reveal-on-
    scroll) rather than attempting to generate video/GIF frames from it.
- **Fonts**: `next/font` (Google or local) for every typeface in
  `docs/DESIGN.md` — self-hosted at build time, zero layout shift from
  late font swap, never a render-blocking `<link>` to an external font CDN.
- **SEO/metadata**: Next.js Metadata API (`generateMetadata`/static
  `metadata` export) on every route — title, description, canonical URL,
  Open Graph + Twitter card fields, using a real generated/committed OG
  image (same Pollinations-or-local-asset rule as hero art, never a
  placeholder-service URL). App-root `sitemap.ts` and `robots.ts` (Next's
  file conventions) reflect real routes, excluding auth-gated/admin
paths. JSON-LD structured data (`Organization`/`Product`/`Article` as
  applicable) only states real facts already present elsewhere in the app
  — never invented ratings, prices, or review counts.
- **PWA basics**: a real favicon set (`icon.png`/`apple-icon.png` via
  Next's file conventions) and `manifest.ts`/`manifest.json` (name, icons,
  `theme_color`, `background_color`) generated from `docs/DESIGN.md`'s
  palette — no default framework favicon shipped to production.
- **Theming**: if `docs/DESIGN.md` specifies dark mode or the product
  category expects it (dashboards, dev tools), implement via `next-themes`
  (class-based, respects `prefers-color-scheme`, no flash-of-wrong-theme —
  verify with a hard reload in each mode) rather than a bespoke context;
  otherwise a single well-executed theme is fine — never ship a half-wired
  theme toggle that leaves some components unstyled in dark mode.
- **Feedback/loading states**: toast notifications via `sonner` (or
  shadcn/ui's wrapper around it) for every mutation's success/error
  feedback — never a silent failure or a `console.log`-only error. Loading
  states use real skeleton components (matching final layout dimensions,
  no CLS on content swap) or React Suspense streaming (`loading.tsx`,
  `<Suspense>` boundaries) for slow data fetches — never a bare spinner
  with no shape for anything above a trivial fetch. Every route segment
  that can throw has a `error.tsx` boundary with an actionable retry, so
  one broken component never blanks the whole page.
- **Performance budget**: the `web-vitals` package reports Core Web
  Vitals (LCP, INP, CLS) from real page loads to the same
  `observability-and-instrumentation` pipeline as the rest of the app —
  target LCP < 2.5s, INP < 200ms, CLS < 0.1 at the 75th percentile;
  Lighthouse/Playwright trace in CI catches an obvious regression
  (unoptimized hero image, layout-shifting late-loading font/ad slot,
  a heavy client bundle blocking interactivity) before it ships, not
  after a user reports a sluggish page.
- **Prerendering/bfcache**: where the framework supports it (Next.js
  `next/navigation` link prefetch is the default equivalent; add the
  Speculation Rules API — `<script type="speculationrules">` with a
  `prerender`/`prefetch` list — for a plain/non-Next setup), let likely
  next-navigations prerender in the background, and keep pages
  back/forward-cache-eligible (no unload handlers, no open connections
  held past navigation) so browser-back feels instant. This is a
  measured perf technique (case studies report double-digit LCP/
  engagement gains), not speculative polish — verify bfcache
  eligibility via Lighthouse's "back/forward cache" audit, don't just
  assume it.
- **Data**: PostgreSQL (Docker `compose.yaml` for local, managed in prod) +
  Prisma with real migrations. Use the installed **prisma** skills for
  setup and the client API. Local dockerized Postgres needs NO credentials
  — the data tier costs the user nothing to paste; cloud managed DB
  (Neon/RDS) is a DEPLOYMENT.md production option, not a local blocker.
- **API**: Route Handlers, **Zod** validated inputs at every boundary.
- **Auth**: Auth.js v5. Argon2/bcrypt hashing (bcrypt if argon2 not
  available), httpOnly-Secure-SameSite cookies, CSRF protection on
  state-changing calls, server-side RBAC on every mutating route.
- **AI — mandatory in every app**: an embedded AI chat assistant plus ≥1
  AI-assisted feature, per `docs/PRD.md`. OpenAI-compatible API called
  ONLY server-side via the env module (`AI_API_KEY`/`AI_MODEL`/
  `AI_BASE_URL` in `.env`, placed there via the Phase 0 scaffold story).
  Chat endpoint: Route Handler with streaming, Zod-validated input,
  per-user rate limits, and a clean chatbot UI (ContextualHelp / chat
  panel) — no key ever reaches the browser.
- **Antihallucination / anti-slop (build these into the AI features, not
  optional)**: answers are grounded with cited sources when the product
  holds the data (RAG over the real DB/docs); absent data → explicit "I
  don't have that" refusal, never a fabricated stat/user/amount; no
  state mutation by the chatbot without human confirmation in the UI;
  conservative temperature; AI output rendered as plain text; per-user
  daily caps.
- **Testing**: Vitest for unit/integration; Playwright for e2e (real
  browser via the Playwright MCP or agent-browser when you installed it).
- **Deploy**: Dockerized (non-root, slim image), GitHub Actions CI, deploy
  target made explicit in `docs/DEPLOYMENT.md`.
- **CI/CD pipeline is one ordered, fail-fast gate, not scattered scripts**:
  `git push` → lint → typecheck → unit tests → integration tests → build
  → SAST/dependency/secrets scan (section 6) → deploy staging → smoke
  tests against the staging deploy (health check + one critical user
  journey, real HTTP calls, not a config glance) → production. Each
  stage blocks the next; a failing lint/typecheck/test/build/security/
  smoke-test stage means CI is red and nothing promotes to production —
  `ci-cd-and-automation` drives the actual GitHub Actions config, this is
  the required stage order for THIS project, not a suggestion. Rollback
  is a tested capability, not a hope: the deploy config documents (and,
  where the platform supports it, automates) reverting to the prior
  release — actually exercise it once against staging before relying on
  it in production.
- **Environment separation**: LOCAL → DEVELOPMENT → STAGING → PRODUCTION,
  each with its own database, its own credentials, and its own copy of
  `.env` — never a shared database or shared API keys across environments
  (a staging bug must never be able to mutate production data). Migrations
  run the same way in every environment (`prisma migrate deploy`, never a
  manual schema edit in one environment only).
- **API contract requirements** (`api-and-interface-design` covers the
  full design, these are the two commonly-skipped ones): every route is
  versioned from the first endpoint (`/api/v1/...`, never bare `/api/...`
  with versioning deferred "until we need it" — retrofitting a version
  onto live consumers is a breaking migration, not a config change); every
  route enforces a request-body size limit (explicit `express.json({
  limit: ... })`/Next.js route-handler equivalent — never the framework
  default with no thought given to it) so an oversized payload 413s
  instead of exhausting memory.
- **Background jobs (AI processing, email, reports, exports, scheduled
  tasks)**: every queue has a bounded retry policy (2–3 attempts,
  backoff) and a dead-letter path for a job that still fails — it lands
  somewhere inspectable, never silently vanishes. Jobs are idempotent
  (safe to retry/redeliver without double-effect, e.g. an idempotency key
  on a payment-triggered job) and expose a status a user/admin can query
  (queued/running/succeeded/failed), not a fire-and-forget call.
- **Webhooks (payments, integrations)**: verify the provider's signature
  on every inbound webhook before trusting the payload (reject on a
  missing/invalid signature); handle redelivery idempotently (a dedupe
  key/table keyed on the provider's event ID) so a provider's at-least-
  once retry never double-applies an effect (double-fulfilling an order,
  double-sending an email).
- **Fault tolerance/robustness (production-shaped, not demo-shaped)**:
  - Every outbound call to an external provider (AI, payments, email,
    storage) wraps in retry-with-exponential-backoff + jitter and a
    bounded timeout (`AbortSignal.timeout`) — never an unbounded fetch
    that can hang a request indefinitely. Cap retries (2–3) so a
    dependency outage degrades a single request, not the whole app.
    A dependency that fails repeatedly within a short window opens a
    simple in-memory/Redis-backed circuit breaker (return the cached/
    degraded response or a clear "temporarily unavailable" state
    instead of piling up retries against a downed provider) — fail fast
    and visibly beats a slow cascading failure.
  - Health/readiness endpoints (`/api/health` — liveness; a DB-ping
    check for readiness) so the container orchestrator/deploy platform
    can detect and restart a wedged instance instead of routing traffic
    to a dead one.
  - Graceful shutdown: the server handles `SIGTERM` by stopping new
    connections, finishing in-flight requests, then closing the DB pool
    — a deploy/restart never silently drops a request mid-flight.
  - Database connection pool has an explicit size cap and pool-exhaustion
    behavior (queue with timeout, not an unbounded wait) — verified
    against `docs/ARCHITECTURE.md`'s scaling plan, not assumed from the
    ORM's defaults.
  - This is the FAULT-TOLERANCE bar for section 6c — build it into the
    first vertical slice's infrastructure story, not bolted on at the end.
  - **Data integrity under concurrency**: a double-click/network-retry
    on a mutation must not create a duplicate row (idempotency key or a
    unique constraint the DB enforces, not just a disabled submit button);
    concurrent edits to the same record use a version/updated_at check
    (optimistic concurrency) or a DB transaction, not last-write-wins by
    accident; a partial failure mid-transaction rolls back cleanly (wrap
    multi-step writes in a real DB transaction) so a refresh never shows
    half-applied state.

## 2b. Repository structure (enforced, not incidental)

A fresh ralph iteration re-derives "where does this go" every run unless
the layout is fixed once and never drifts. Enforce this shape from the
first commit (the scaffold story), Next.js-App-Router-shaped:

```
project/
├── src/
│   ├── app/            # routes (App Router) — thin, no business logic
│   ├── components/     # UI components, organized by feature/domain
│   ├── services/        # business logic, one file/module per domain
│   ├── lib/             # db client, env module, auth config, utilities
│   ├── workers/         # background job handlers (if any)
│   └── types/           # centralized shared types (never per-component ad hoc)
├── prisma/              # schema + migrations (the DB layer, separated)
├── tests/               # unit + integration, mirrors src/ structure
├── e2e/                 # Playwright specs
├── scripts/             # ralph driver, seed scripts, one-off ops scripts
├── docs/
├── public/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
└── README.md
```

- Business logic lives in `services/`, never inline in an `app/` route
  handler or a React component — a route handler calls a service function,
  it doesn't contain the logic itself (this is the same rule as the
  business-logic-separation bullet in section 6c, enforced structurally
  here so it isn't a per-story judgment call).
- Types used across more than one feature go in `types/`, not redeclared
  per-component; Prisma-generated types are re-exported from `lib/`, not
  duplicated by hand.
- `AGENTS.md` (section 3b) references this exact layout so every fresh
  ralph iteration knows where new code belongs without re-deriving it —
  a story that can't find an obvious home in this structure is a signal
  the story is scoped wrong, not a reason to invent a new top-level folder.

## 3. Load the installed skills at the right moment

All of these are installed globally, so every fresh ralph iteration loads
them too — your per-story agents and the final audit use them directly.
In this supervising session, chain them when you do Phase 0 and the final
gate:

| Phase | Skill(s) |
|---|---|
| Scaffold & UI architecture | `vercel-react-best-practices`, `frontend-ui-engineering`, `web-design-guidelines`, `vercel-composition-patterns` |
| Design execution | `ui-ux-pro-max`, `design-taste-frontend`, `impeccable`, `frontend-design` (anthropics/skills), `emil-design-eng` (Emil Kowalski's craft/motion philosophy), `building-components` (vercel/components.build — composable/accessible component APIs, tokens, theming), `shadcn` (shadcn-ui/ui official skill — correct CLI usage, `npx shadcn@latest docs <component>` lookup, avoids stale/hallucinated component APIs), `@design-md`/`awesome-claude-design` reference collections, `21st.dev`/magicui/aceternity-ui/kokonutui/originui/hyperui/preline browsed manually for free premium component inspiration (never installed as a CLI — none clear the reputability bar or require a paid account) |
| Motion & view transitions | `vercel-react-view-transitions`, `ui-ux-pro-max` (GSAP presets reference) |
| Architecture quality (robustness pass) | `codebase-design` (shared vocabulary: module/interface/depth/seam/adapter), `domain-modeling` (glossary + ADRs in `docs/adr/`), `improve-codebase-architecture` (mattpocock/skills — run against the codebase's git-log hot spots once the core vertical slices exist, before the final Phase 3 gate, to surface shallow modules/tight coupling before they calcify) |
| Performance & Core Web Vitals | `vercel-optimize`, `vercel-react-best-practices` |
| Data layer | `prisma-database-setup`, `prisma-postgres`, `prisma-client-api` |
| API design | `api-and-interface-design` |
| UI polish/animated sections | `magic-ui` (open-source Magic UI registry — marquee, globe, blur-fade, shiny-button and similar Tailwind-based effects; reach for it before hand-rolling a bespoke animation) |
| AI chat interface | `agent-elements` (shadcn-compatible registry at `agent-elements.21st.dev`, typed around the Vercel AI SDK's `UIMessage`/`useChat` — use for the mandatory embedded AI chat's message list, composer, and streaming states instead of hand-building them) |
| Backend scalability | `nodejs-backend-patterns` (wshobson/agents — layered architecture, connection pooling, Redis caching strategies, background job processing, real-time/WebSockets) |
| Load & performance testing | `k6` (grafana/skills — official Grafana Labs k6 script generation; run a real load test against key endpoints before shipping, not just a Lighthouse pass) |
| Tests | `test-driven-development` (write the test with the slice) |
| AI feature prompts | `prompt-engineering-patterns` (chatbot system prompt, prompt templates, few-shot/structured-output patterns) |
| Browser verification | Playwright MCP / `agent-browser` / `browser-testing-with-devtools` |
| Security pass | `security-and-hardening`, `security-review` (getsentry/skills — run on every diff during code review, not just at the final gate), `sast-configuration` (wshobson/agents — Semgrep/CodeQL CI gate, continuous automated static scanning) |
| Strix pentest | `web-app-penetration-testing`, `penetration-testing-with-strix`, `fix-security-vulnerabilities-with-strix`, `owasp-top-10-testing` (usestrix/strix — structures the Strix run around the full OWASP Top 10, not just whatever Strix explores on its own) |
| Review & ship | `code-review-and-quality`, `observability-and-instrumentation`, `ci-cd-and-automation`, `shipping-and-launch` |

## 3b. `AGENTS.md` — the permanent per-story agent rules (write once, scaffold story)

The scaffold story (US-001) writes `AGENTS.md` at the project root with
these rules verbatim (every fresh ralph iteration reads this file — it's
the only cross-iteration behavioral memory besides git history and
`progress.txt`):

1. Never delete existing functionality without explicit approval.
2. Never modify unrelated files outside this story's scope.
3. Never expose secrets (no logging, no client bundle, no error message).
4. Never hardcode credentials — everything through the env module.
5. Never bypass authentication or authorization to make a test pass.
6. Never create fake backend functionality — no stub that returns success.
7. Never use mock data in a production code path (tests may mock).
8. Never silently change the database schema — every change is a migration.
9. Every schema change must have a runnable, reversible migration.
10. Preserve existing APIs unless the story explicitly changes them.
11. Reuse existing components/modules before creating duplicates.
12. Keep business logic in the backend/service layer, not UI components.
13. Validate all external input (Zod at every boundary).
14. Every API call's UI has loading, success, empty, and error states.
15. Write a test for the story's critical logic before marking it done.
16. Run lint, typecheck, and tests after every non-trivial change.
17. Fix root causes; never silence/suppress an error to get to green.
18. Never claim a feature works without having verified it runs.
19. Mark any invented business-requirement assumption explicitly (in
    `docs/DECISIONS.md` or a code comment), never invent silently.
20. Before marking a story `passes: true`, do a quick production-
    readiness self-check against this list.

## 4. Execution — the ralph loop (monitors and keeps the build in check)

You do NOT build slice-by-slice by hand. **Ralph** (snarktank/ralph,
adapted to opencode here) drives it: each iteration spawns a FRESH, headless
`opencode run` that implements ONE small story from `prd.json`. Memory
between iterations = git history, `progress.txt`, `AGENTS.md`. Clean
context per story, green commits, no context drift. The full product is
built this way — nothing is MVP-cut, everything is ordered by story
priority across the whole scope.

1. **Install the driver into the project** (once):
   ```bash
   mkdir -p scripts/ralph
   cp -r "$HOME/.agents/ralph/scripts/ralph/." scripts/ralph/
   chmod +x scripts/ralph/ralph-opencode.sh scripts/ralph/ralph-iteration.sh scripts/ralph/ralph-heartbeat.sh
   ```
   `ralph-opencode.sh` = the loop; `OPENCODE.md` = per-iteration agent
   instructions (one story, quality gates, browser verification, commit,
   `passes: true`, `progress.txt`, AGENTS.md patterns, COMPLETE marker).
   Read both before running; they are your ground truth.
2. **Phase 0 — hands-free provisioning (you, in this session).** Remove
   every environment blocker BEFORE the loop starts so nothing stalls
   behind infra:
   - git repo exists (init if not); repo-local identity set if unset
     (`git config user.name "ralph-agent"`, `git config user.email
     "ralph@local"`); branch created from `prd.json.branchName`.
   - `opencode` is on PATH, authenticated (`opencode auth list` shows a
     provider), and a trivial `opencode run --auto "reply ok"` succeeds —
     catch broken/missing auth BEFORE the first of many hours-long
     iterations, not during it.
   - `scripts/ralph/progress.txt` exists.
- `.gitignore` handles the loop artifacts: IGNORE `build.log`,
      `ralph.log`, `heartbeat.log`, `heartbeat.state`, `.ralph.pid`,
      `.iteration.pid`, `scripts/ralph/.last-branch`,
      `scripts/ralph/archive/`, `scripts/ralph/.admin-credentials`,
      `.opencode-sessions.log`,
      `.env`, `.env.*`, `node_modules`, `.next`; TRACK `prd.json`,
      `progress.txt`, and `scripts/ralph/` (driver + iteration + heartbeat
      + OPENCODE.md) so the build's memory, task list, and watcher travel
      with the repo.
- `.env` exists (gitignored): generate it from `prd.json.envVars` —
      `from: "auto"` vars get real random secrets (`openssl rand -hex 32`
      for auth/encryption keys, real local URLs); `from: "user"` vars are
      written EMPTY with the comment from `envVars[].description`. Never
      paste placeholder values into `.env`.
   - The scaffold story (US-001) creates the env module (`src/lib/env.ts`
      pattern: dotenv + Zod schema + single validated `env` export) and the
      complete commented `.env.example` mirroring `prd.json.envVars`
      var-for-var as its FIRST deliverable, before any integration code
      exists to read from it.
   - Local real DB is running: `docker compose up -d postgres` (or the
     compose DB service) and wait until healthy — this needs NO account,
     so the data tier is genuinely hands-free.
- Playwright browsers installed once: `npx playwright install
      --with-deps chromium` (or the agent-browser browser), so browser
      verification can't fail on first run.
   - Strix pentest CLI installed once (`pipx install strix-agent` or
     `curl -sSL https://strix.ai/install | bash`); the first scan pulls the
     Docker sandbox image, so the security gate can't fail on missing tooling.
   - Strix uses the SAME LLM as opencode (OmniRoute, OpenAI-compatible at
     `http://localhost:20128/v1`) — no separate account. Add its env vars to
     the gitignored `.env` (Strix reads them at CLI time; the app env module
     stays untouched): `STRIX_LLM=openai/auto`, `LLM_API_BASE=http://localhost:20128/v1`,
     `LLM_API_KEY` (any non-empty stub OmniRoute accepts), and optionally
     `STRIX_REASONING_EFFORT=high`.
3. **Run the loop in the BACKGROUND.** A full-product build runs for hours
   — a foreground call will outlive any single command cap, so launch it
   detached and poll:
   ```bash
   nohup ./scripts/ralph/ralph-opencode.sh 200 > scripts/ralph/ralph.log 2>&1 &
   nohup ./scripts/ralph/ralph-heartbeat.sh > scripts/ralph/heartbeat.log 2>&1 &
   ```
   The **heartbeat is model/token-free** (pure shell): it watches
   `.ralph.pid`/`.iteration.pid` + `ralph.log` growth and self-heals the
   loop — kills an iteration idle > HEARTBEAT_IDLE_TTL (default 15 min),
   relaunches a dead driver (up to HEARTBEAT_MAX_RELAUNCH=6), and exits 0
   only when every story passes. Its verdicts (RUNNING/IDLE/DEAD/DONE/
   FAILED) stream to `scripts/ralph/heartbeat.state`.
   Exit 0 = `<promise>COMPLETE</promise>` (every story `passes: true`).
   Exit 1 = hit max iterations; it prints the remaining stories and points
   at `progress.txt`. Prior runs are archived to `scripts/ralph/archive/`
   automatically when `branchName` changes. A 45-min per-iteration hang cap
   is active when `gtimeout` (brew install coreutils) is on PATH.
   - **Every iteration's session id is captured, not just its log.** Each
     spawned `opencode run` uses `--print-logs --title "ralph-iter-<n>"`;
     `ralph-iteration.sh` greps the `id=ses_...` it emits and appends
     `<timestamp>  ralph-iter-<n>  <sessionID>` to
     `<project>/.opencode-sessions.log` (the same file the top-level
     builder supervisor wrote its own session id to — see builder's
     Project/boundary rules). `tail -f .opencode-sessions.log` next to
     `tail -f scripts/ralph/ralph.log` lets the user pick any in-flight or
     past iteration and run `opencode <project dir> --session <sessionID>`
     (or open the TUI's session picker / `opencode session list`) to
     literally watch that iteration work in real time instead of only
     reading its log output after the fact. (`opencode attach <url>`
     attaches to a running *server* by URL — a different thing — not the
     right command for opening a session by id.)
4. **Supervise — poll, don't babysit.** The loop is autonomous; you own the
   outcome. Every few minutes check in with:
   ```bash
   jq -r '.userStories[] | "\(.passes) \(.id) \(.title)"' prd.json   # per-story state
   jq '[.userStories[] | select(.passes==true)] | length' prd.json   # completed count
   tail -20 scripts/ralph/ralph.log                                   # last iteration
   git log --oneline -10                                              # commit stream
   ```
   If ~3 consecutive iterations flip no `passes: false → true`, pause/kill
   the loop, diagnose the SHAPE of the stall before relaunching:
   - **Repeated identical provider errors (5xx/timeout) in `ralph.log`**:
     an upstream LLM outage/rate-limit, not a story problem — back off and
     relaunch as-is; do not touch `prd.json`.
   - **Iterations complete, `ralph.log` is clean, but nothing commits**: a
     permission problem — the headless runs are most likely being denied
     by `opencode.json` permission rules; auto-allow the project so
     `--auto` can act.
   - **Iterations run long and end without a clean pass/fail signal**: the
     story is too big or a docs fact is missing — split the story or fix
     `prd.json`/docs.
   - **AI story stuck on an unset `AI_API_KEY`**: it should pass via the
     local mock-AI test double, not a real key — fix the story's
     acceptance criteria, not the environment.
   Fix the actual block, then relaunch. Never re-run green stories — set
   their `passes: true` instead.
5. **Final gate after COMPLETE** — the last user story is the whole-app
   audit (design + security + full e2e in a real browser). Then do one
   independent review pass on the final diff with `code-review-and-quality`
   and `security-and-hardening`; fix every CRITICAL/HIGH finding before the
   final report. Add these gate commits directly.
   - Before that pass, run the installed `security-review` skill
     (getsentry/skills) against the SAME final diff — it catches the
     class of bug static linting misses (injection, auth bypass, SSRF,
     insecure deserialization, secrets in code) with dedicated security
     review reasoning, distinct from `security-and-hardening`'s checklist
     and from Strix's runtime exploitation. Treat its findings the same
     as `code-review-and-quality`'s: CRITICAL/HIGH block the report.
   - When the Strix runtime pentest runs (section 6b), load
     `owasp-top-10-testing` (usestrix/strix) alongside the three Strix
     skills already required so the attack run is explicitly walked
     against the full OWASP Top 10 categories — injection, broken
     access control, cryptographic failures, insecure design, security
     misconfiguration, vulnerable/outdated components, auth failures,
     software/data integrity failures, logging/monitoring failures, SSRF
     — rather than only whatever Strix's autonomous exploration happens
     to try first.

## 5. The no-mock-data gate (verify before done)

Walk every screen and route:

- [ ] Real DB behind every read/write; no in-memory or fixture stores.
- [ ] No lorem ipsum / dummy images / fake users in real screens.
- [ ] No hardcoded secrets, URLs, or credentials anywhere in source.
- [ ] Session/auth is real; no dev-only bypass authentication.
- [ ] Seeded content is env-scoped, real, and authored — not throwaway.
- [ ] Every requirement accepts real input and persists real output.
- [ ] AI features pass their e2e against a local OpenAI-compatible test
  double when `AI_API_KEY` is unset (stub server lives in the repo, tests
  point `AI_BASE_URL` at it) — a test double is not mock data; the running
  app still shows the gated-off UI until a real key is pasted.
- [ ] Antihallucination verified in those e2e: grounded responses carry
  sources, gap-questions get "I don't have that" (not invented data), and
  no AI-initiated mutation happens without user confirmation.
- [ ] No unresolved placeholders: `grep -rnE "jsonplaceholder|@todo|TODO|FIXME|your_app|insert_secret" src app pages components` finds only nothing actionable, or items you fix on the spot.

## 6. Security minimums (from docs/SECURITY.md; enforce anyway)

- Input validation at every trust boundary (Zod → 422, never 500).
- Parameterized queries via Prisma only; no SQL string building.
- Passwords Argon2/bcrypt; sessions httpOnly+Secure+SameSite; CSRF
  protection; RBAC enforced server-side on each mutating route.
- Security headers + CSP on all responses; CORS allowlist, no wildcards.
  Named explicitly, not just "headers": `Content-Security-Policy`,
  `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in CSP) against
  clickjacking, `Strict-Transport-Security` in prod, `X-Content-Type-
  Options: nosniff`. Verify with real response headers (curl -I or
  browser devtools), not by reading the middleware source and assuming.
- **Client-side/browser-side XSS is a general rule, not just AI output:**
  any user-generated content rendered as HTML anywhere in the app (not
  only the AI chat) is escaped/sanitized (React's default JSX escaping is
  fine; any `dangerouslySetInnerHTML` or raw-HTML render path requires
  an explicit sanitizer, e.g. `DOMPurify`, and a one-line justification
  comment for why raw HTML is needed at all).
- **No sensitive tokens in browser storage:** session/auth tokens live
  only in httpOnly cookies, never `localStorage`/`sessionStorage`/a
  non-httpOnly cookie — those are readable by any XSS payload that
  slips through, turning a single XSS bug into full account takeover.
- Rate limit auth + public mutation endpoints; lockout on brute force.
  Also rate-limit expensive/read-heavy public GET routes (search, list,
  export endpoints) — unthrottled reads are a real DoS/scraping vector,
  not just writes.
- AI/chat endpoints: rate-limited per user, Zod-validated input, AI output
  rendered as plain text (never raw HTML), no cross-user data leakage into
  prompts/context. Antihallucination enforced: grounded + cited answers
  over product data, explicit "I don't have that" on gaps, no AI-initiated
  mutations without human confirmation. Also enforce a **per-user daily
  spend/call cap** on every LLM-calling endpoint (not just a rate limit
  per minute) — a slow drip of allowed-rate calls can still run up a real
  bill over a day; cap it server-side, independent of the rate limiter.
- No secrets in logs/errors/repos; least-privilege DB user; non-root
  container; HTTPS-only in prod.
- **Application quality is a gate, not a byproduct:** `frontend-ui-
  engineering` and `web-design-guidelines` are loaded during build
  (section 3), but that alone doesn't prove compliance — run an explicit
  accessibility pass before done: keyboard-only navigation through every
  core flow works, every interactive element has a visible focus state
  and an accessible name (label/aria-label), color contrast meets WCAG AA,
  and images/icons carry alt text or `aria-hidden` when decorative. A
  Lighthouse or axe-core run against the core pages is the concrete
  evidence, not a visual glance.
- **Dependency/SCA scanning is a CI gate, not a mention:** `npm audit
  --audit-level=high` (or the installed **security-and-hardening** skill's
  equivalent) runs in CI and fails the build on a HIGH/CRITICAL advisory;
  container image scanning (e.g. `docker scout` or the CI runner's built-in
  scanner) runs against the built image before it's called deployable.
- **Load/performance testing is a real run, not a guess:** load the
  installed `k6` skill (grafana/skills, official Grafana Labs) to generate
  and run an actual k6 script against the core API endpoints (auth, the
  primary CRUD path, the AI chat endpoint) before the app is called
  shippable — concrete p95/p99 latency and error-rate numbers under
  concurrent load, not an assumption from a single manual request. Backend
  scalability patterns (connection pooling caps, caching, background jobs)
  come from `nodejs-backend-patterns` (wshobson/agents) so there's
  something real for the load test to validate.
- **SAST is a CI gate, not a one-time mention:** load the installed
  `sast-configuration` skill (Semgrep/CodeQL config, custom rules, quality
  gates) to wire a real static-analysis scan into CI on every push/PR —
  catches injection/insecure-deserialization/hardcoded-crypto classes of
  bug automatically and continuously, distinct from the ONE-TIME manual
  `security-review` pass on the final diff and from Strix's runtime
  exploitation. Fails the build on a HIGH/CRITICAL finding, same bar as
  the dependency/SCA gate.
- **Secrets-scanning is a CI gate, not an assumption:** CI runs a
  secrets-scan (e.g. `gitleaks detect` or equivalent) over the diff/history
  before merge — catches a committed `.env`, API key, or credential that
  `.gitignore` alone didn't prevent, since a single bad commit in history
  is still a leak even if a later commit removes the file.
- **Slopsquatting defense on application dependencies:** every new npm/pip
  package the ralph loop installs mid-build (not just the pack's own
  skill dependencies, which builder's Phase 0 already verifies) must be
  checked to actually exist on the registry, have a nonzero real download
  history, and match the name the docs/framework actually use — before
  running install. An AI coding loop hallucinating a package name is a
  known live attack vector (a squatter publishes the hallucinated name
  first); never install a package whose existence wasn't just confirmed.
- **No client-exposed secret prefixes:** if the framework has a
  build-time public-var convention (Next.js `NEXT_PUBLIC_*`, Vite
  `VITE_*`), grep for it against the secrets list in `.env.example` — a
  payment/AI/DB secret accidentally given that prefix ships straight to
  the browser bundle and is a hard-stop finding, not a warning.

## 6a2. Session, token, and account-recovery lifecycle (verify, don't assume)

- **Sessions/JWTs expire.** A token that never expires turns one leaked
  copy into a permanent backdoor — set and test a real expiry, plus
  server-side session invalidation on password change, role change, and
  account suspension.
- **Password reset tokens are single-use and time-boxed** (30-60 min) —
  test that a reused or expired reset link is rejected, not silently
  accepted.
- **Email verification is actually enforced**, not just sent — test that
  an unverified account is blocked from sensitive routes/features, since
  AI-generated auth flows commonly build the verification email but skip
  wiring the block.
- **OAuth `state` parameter is generated server-side, stored in session,
  and validated on callback**, for every OAuth provider wired in
  (Google/GitHub/etc.) — missing `state` validation is a CSRF hole on the
  login flow itself, easy to miss because the happy-path login still
  works fine without it.

## 6a3. Authorization — prove it, don't just implement it

Implementing RBAC is not the same as verifying it holds. For every
resource-by-ID route (`/api/orders/:id`, `/api/users/:id/profile`, etc.)
and every admin-only route, this is a required e2e test, not optional:

- **IDOR test:** authenticate as User A, request/mutate a resource ID
  known to belong to User B — expect 403/404, never the data or a
  successful mutation. Repeat for every resource type the schema exposes
  by ID (not just the one the happy-path test already covers).
- **Admin-boundary test:** authenticate as an ordinary user, call every
  admin-only route directly — expect a hard deny, not just a hidden UI
  button (a client-side-only guard is not a control).
- **Multi-tenant isolation test** (if the product has orgs/workspaces):
  two accounts in two different tenants, confirm neither can read, list,
  export, search, or infer the other's records — including via secondary
  surfaces (search results, analytics aggregates, AI-generated summaries,
  background job output), which is where tenant leaks most often hide
  because the main dashboard was the only surface anyone tested.
- Every tenant-scoped Prisma query filters by the tenant/org ID **at the
  database query itself** (`where: { orgId }`), never fetched broadly and
  filtered client-side or in application code after the fact.

## 6a4. File uploads, server-side fetches, and error handling

- **File uploads**: allowlist MIME type AND validate actual file content
  (not just the browser-supplied `Content-Type` header, which is
  attacker-controlled), enforce a max size server-side, store outside any
  publicly-addressable path, and serve private files only via
  authorized/short-lived signed URLs — never a guessable static path.
- **Server-side fetches of user-supplied URLs** (link previews, imports,
  webhook callbacks the app itself makes, AI tool use that fetches a
  URL): block internal/private IP ranges and cloud metadata endpoints
  (`169.254.169.254`), validate the resolved DNS target, and restrict to
  `http(s)` only — this is SSRF, and AI-assisted "fetch this URL for the
  user" features are a common place for it to sneak in unreviewed.
- **Errors fail closed and stay generic to the client:** unexpected
  exceptions deny the sensitive action rather than falling through to an
  allowed state; 500 responses never leak stack traces, SQL fragments, or
  internal file paths to the client — log the detail server-side only.

## 6a5. Payments and webhooks (only relevant if the product has them)

- **Every webhook (Stripe, or any provider) verifies the provider's
  signature** against the raw/unmodified request body using the
  provider's own SDK helper — never trust an unsigned or unverifiable
  payload to change order/subscription/account state.
- **Webhook handlers are idempotent**: store the provider's event ID and
  skip reprocessing a duplicate delivery (providers retry by design) —
  a non-idempotent handler double-fulfills on every retry.
- **Subscription/entitlement status is checked server-side on every
  gated request**, never read from client-cached state — a cancelled
  subscription must lose access within the next request, not the next
  page reload.
- **Amounts/prices/discounts are computed server-side from the DB**,
  never trusted from a client-submitted value, even one that "just
  echoes" what the UI showed.

## 6a5b. Third-party integration connection status (any OAuth/API integration)

Every user-facing third-party integration (OAuth app connection, API-key
integration, webhook-based sync) surfaces its state as one of a named,
explicit status — not just "it either works or the button spins forever":

- `connected` — real, verified (a live token/credential exists and the
  last health check succeeded).
- `connecting` — the OAuth/setup flow is in progress.
- `disconnected` — no credential stored, or the user explicitly disconnected.
- `expired` — the stored token/credential is past its lifetime; prompts
  reconnect rather than silently failing on the next real API call.
- `error` — the last call failed (store the failure reason for support/
  debugging, never expose the raw provider error to the end user).
- `rate_limited` — the provider is throttling; show a clear "retrying" or
  "back off until X" state instead of a generic error.

Store this as an explicit enum column (or equivalent) per integration
record, updated by the actual API calls (not inferred from the UI) —
a disconnect/reconnect action is a real button that revokes/re-issues the
credential, not just a client-side toggle.

## 6a6. Pages & UX-state completeness audit (evidence-based, applicability-gated)

A "production-ready" app is judged on more than the happy path — missing
legal pages, missing account-lifecycle screens, or an unhandled 404/500
are exactly the kind of gap a user notices first. Do NOT mechanically
generate every item below for every product — each is applicable only if
the evidence says so. This is an audit-then-build step, run once the core
features exist and again as part of section 6c.

1. **Inspect before creating anything**: routes/navigation, auth flow,
   payment/subscription code, cookies/tracking, user-generated content,
   file uploads/permissions, and `prd.json`/docs for what the product
   actually does. Applicability is decided from this evidence, never
   assumed from the product category alone.
2. **Write `docs/PRODUCTION_PAGE_AUDIT.md`** — one row per candidate item
   below: `status` (`EXISTS_AND_ADEQUATE` / `EXISTS_NEEDS_IMPROVEMENT` /
   `APPLICABLE_MISSING` / `NOT_APPLICABLE` / `BLOCKED_BY_MISSING_INFO`),
   `evidence` (file path/route/model), and `reason`. Only build the
   `APPLICABLE_MISSING` and `EXISTS_NEEDS_IMPROVEMENT` rows.
   - **Legal pages** (gate on evidence, don't guess facts): Privacy
     Policy (any personal/device data collected), Terms of Service
     (accounts/transactions/UGC), Cookie Policy + Cookie Preferences (only
     if non-essential cookies/tracking exist), Refund/Cancellation/
     Shipping/Return Policy (only if the matching commerce flow exists),
     Disclaimer, Accessibility Statement (never claim full WCAG
     conformance without an actual audit), Data Processing Agreement (B2B
     data processing), Acceptable Use Policy, Security Policy +
     Responsible Disclosure contact, Community Guidelines (only if
     social/UGC features exist). **Never invent** a company name,
     address, jurisdiction, retention period, or compliance claim
     (GDPR/CCPA/SOC 2/etc.) — collect any missing fact from the user as a
     single consolidated question set instead of fabricating it, and mark
     the page `BLOCKED_BY_MISSING_INFO` in the audit until answered.
   - **Customer lifecycle pages** (build only what the product uses):
     Login/Register, Email Verification, Forgot/Reset Password (real
     backend — expiring single-use tokens, no account-enumeration in the
     response), Onboarding, Account Settings (+ account deletion if
     accounts exist), Billing/Upgrade/Downgrade/Cancel Subscription and
     Payment Success/Failed/Pending (only for products with
     payments/subscriptions; payment status verified from the provider/
     backend, never trusted from a URL param), Support/Help Center
     (referencing real support channels, not placeholders).
   - **UX system states** as reusable components wired into real
     navigation (not orphan pages): 404, 403, 500 (no stack
     trace/secret leak), Maintenance (driven by real config/backend
     status), Offline, Empty State, No Search Results (preserve the
     query), Loading State, Error State (actionable recovery), Success
     State, Session Expired (safe redirect, no redirect loop).
3. **Implement using the existing design system/routing/components** —
   match visual identity, connect every new page into real navigation
   (footer/settings/auth/checkout/error-handling as applicable), and never
   leave an unreachable page.
4. **Report honestly**: list what was created/improved/retained/excluded
   with evidence per item, and a separate "missing owner information"
   list for any legal/business fact that blocked a page — never mark a
   page done if it's unreachable, untested, or contains placeholder legal
   text presented as final.

## 6b. Strix runtime pentest (robustness gate)

Before done, run the installed **web-app-penetration-testing** skill against
the running app. The sandbox reaches the host dev server as
`http://host.docker.internal:<port>`. Always headless and budget-capped:

```bash
strix -n -t http://host.docker.internal:3000 --scan-mode quick --max-budget 20 \
  --instruction "Test account from the seeded bootstrap. Focus: auth, access control, IDOR, injection."
```

Exit `0` = clean; any non-zero exit means findings or an error — don't
assume a fixed code meaning across versions, confirm via `strix view
<run-name>` (or the printed findings list) before deciding which. On
validated findings, load **fix-security-vulnerabilities-with-strix**, patch
the root cause, re-run against the same target, and do not report shipped
until the re-run is clean. Strix runs on the SAME OmniRoute models as
opencode (`STRIX_LLM=openai/auto`, `LLM_API_BASE=http://localhost:20128/v1`).

## 6c. Final checklist validation pass (run before reporting shipped)

Section 6/6a2-6a6 describe what to build. This is the separate,
mandatory step that PROVES it was actually built — walk this list item by
item against the real codebase/running app immediately before reporting
done. Do not mark an item done because it was written into the code
earlier in the loop; re-verify it now, at the end, in one pass, since
later stories can silently regress an earlier control. Any unchecked item
blocks "shipped" — fix it or explicitly report it as a known gap, never
report a silent pass.

- [ ] Auth: password hashing (Argon2/bcrypt), session cookie flags
  (httpOnly+Secure+SameSite), CSRF protection — verified by reading the
  actual auth code, not by memory of having written it.
- [ ] Session/JWT expiry set and tested; password-reset tokens expire and
  are single-use (test a reused/expired link); email verification blocks
  sensitive routes for unverified accounts; OAuth `state` validated on
  every wired provider's callback.
- [ ] RBAC/authorization: run the actual IDOR test (swap a resource ID
  between two seeded accounts, confirm 403/404), the admin-boundary test
  (non-admin account against every admin route), and — if multi-tenant —
  the cross-tenant isolation test across dashboards, search, exports, and
  any AI-generated summaries.
- [ ] Input validation: every mutating route Zod-validates its input
  server-side (not just client-side); parameterized queries/ORM only, no
  string-concatenated SQL anywhere in the codebase (grep for it).
- [ ] File uploads (if any): MIME + real content check server-side, size
  cap enforced, private files served only via authorized/signed URLs.
- [ ] SSRF: any server-side fetch of a user-supplied URL blocks internal
  IP ranges and the cloud metadata address.
- [ ] Rate limiting: login, password-reset, AI/chat endpoints (with a
  daily spend cap, not just a per-minute rate), and expensive/read-heavy
  public GET routes all actually return 429 when hammered — test it, not
  just review the middleware.
- [ ] Payments/webhooks (if any): webhook signature verified against the
  provider SDK helper, handler is idempotent (replay the same event ID
  twice, confirm no double-effect), subscription/entitlement re-checked
  server-side per request, prices/amounts computed server-side.
- [ ] Errors fail closed: force a 500 in dev and confirm the client
  response is generic with no stack trace/SQL fragment/file path; the
  detail only appears in server logs.
- [ ] Secrets: `.env.example` is the exhaustive var catalog with no real
  values; grep the codebase and git history for the actual secret values
  (gitleaks or equivalent) — must be clean; grep for the framework's
  public-var prefix (`NEXT_PUBLIC_*`/`VITE_*`) against the secrets list —
  must be empty.
- [ ] Dependencies: SCA scan (`npm audit --audit-level=high` or
  equivalent) is wired into CI, not just run once manually.
- [ ] Load test: a real `k6` run against core endpoints exists with
  recorded p95/p99 latency and error-rate results, not an assumption.
- [ ] SAST: `sast-configuration`-driven Semgrep/CodeQL scan is a real CI
  step (check the CI config exists and ran, not just that the skill was
  read) and fails the build on a HIGH/CRITICAL finding.
  equivalent) is green; container image scan is green; every dependency
  added mid-build was confirmed to actually exist on the registry before
  install (no hallucinated/squatted package names).
- [ ] Headers/CORS: CSP + security headers present on real responses
  (check with the browser devtools Network tab, not just config review) —
  `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-Security`,
  `X-Content-Type-Options` all present, not just a generic CSP; CORS
  allowlist has no wildcard combined with credentials.
- [ ] Client-side/browser XSS: grep for `dangerouslySetInnerHTML`/raw-HTML
  render paths across the whole app, not just the AI chat — each has a
  sanitizer or a justification comment; session/auth tokens are
  confirmed absent from `localStorage`/`sessionStorage`/non-httpOnly
  cookies (check devtools Application tab on a real logged-in session).
- [ ] Accessibility: keyboard-only pass through every core flow, visible
  focus states, accessible names on interactive elements, WCAG AA color
  contrast — evidenced by a Lighthouse/axe-core run, not a visual glance.
- [ ] Strix pentest (section 6b) has been run at least once against the
  running app this session and exits clean or every validated finding is
  fixed and re-verified.
- [ ] No mock/dummy/fake data anywhere in the shipped paths (section 5)
  — re-confirm by browsing the live app, not by recalling the plan.
- [ ] Pages & UX-state audit (section 6a6): `docs/PRODUCTION_PAGE_AUDIT.md`
  exists and is current; every `APPLICABLE_MISSING` row from it has been
  built and is reachable from real navigation; legal pages present no
  invented facts/compliance claims; 404/403/500/offline/empty/session-
  expired states are wired in, not just designed in isolation.
- [ ] Privacy engineering (if personal data is collected): DSAR export and
  account/data erasure are REAL working flows (test one — request an
  export, confirm it returns real data; delete an account, confirm rows
  are gone/anonymized, not just flagged); consent has an audit trail with
  timestamp + policy version; a retention-enforcement job actually runs
  (check its schedule/logs, not just its code); PII columns are
  encrypted/separated per `gdpr-data-handling`'s patterns — verified by
  reading the schema, not by recalling the plan.
- [ ] UI polish: motion respects `prefers-reduced-motion` (test with it
  enabled in devtools — animations reduce/disable, nothing is
  motion-dependent for comprehension); every content image renders via
  `next/image` with real `alt` text and no placeholder-service URLs
  (Pollinations-generated art committed under `public/generated/` and
  imported locally counts as real; a live Pollinations URL rendered at
  runtime does not); every remote image hostname actually fetched at
  runtime is an explicit `next.config.ts` `remotePatterns` entry, never a
  wildcard; fonts load via `next/font` (no external font-CDN `<link>`, no
  layout shift from late font swap); core flows have purposeful,
  non-gratuitous micro-interactions (button/hover/loading/success
  states), not a static, lifeless UI.
- [ ] Performance budget: `web-vitals` reports LCP/INP/CLS from real page
  loads to the observability pipeline; a Lighthouse/Playwright trace run
  in CI shows LCP < 2.5s, INP < 200ms, CLS < 0.1 on the core flows at a
  75th-percentile-equivalent lab run — not just "the page loads"; the
  hero/LCP image has `priority`/`fetchPriority="high"` set (check the
  rendered `<img>` element, not just the JSX); Lighthouse's back/forward
  cache audit passes on core pages.
- [ ] Fault tolerance: force an external provider (AI/payments/email) to
  fail or hang in dev and confirm the app degrades visibly (retry, then
  a clear "temporarily unavailable" state) instead of hanging the request
  or crashing; `/api/health` and a DB-readiness check both return real
  status; `SIGTERM` sent to the running container completes in-flight
  requests before exiting (check logs, don't just assume); connection
  pool has an explicit cap, verified against `docs/ARCHITECTURE.md`.
- [ ] Architecture quality: `improve-codebase-architecture` has been run
  at least once against the codebase's real hot spots (from `git log`),
  producing real findings or a clean pass — not skipped as "looks fine";
  any HIGH-friction finding (tightly-coupled module blocking testability)
  is fixed or explicitly recorded as a known gap, same as a code-review
  finding.
- [ ] SEO/PWA: every public route has real Metadata API output (title,
  description, OG/Twitter image — view-source or `next build` output,
  not a config glance); `/sitemap.xml` and `/robots.txt` resolve and list
  only real, non-auth-gated routes; favicon/manifest are the app's real
  branding, not framework defaults.
- [ ] Feedback/loading states: mutations show a real toast on
  success/error (test one failing mutation, confirm the user sees it, not
  just a console error); slow routes have skeletons/Suspense matching
  final layout dimensions (no visible CLS on data arrival); each route
  segment's `error.tsx` boundary was actually triggered once (e.g. a
  forced throw) and shown to recover via retry, not just reviewed as code.

## 7. Definition of done

- Ralph loop exited 0: every story in `prd.json` is `passes: true`
  (`jq -r '.userStories[] | select(.passes == false) | .id' prd.json`
  prints nothing). Full product, NOT an MVP cut.
- `npm run lint`, typecheck, `npm run build` pass.
- Unit + integration + e2e suites pass (e2e against the running app).
- Real-data gate (section 5) passes; security minimums (section 6) pass,
  including the dependency/SCA scan and secrets-scan CI gates (section 6)
  — both must be green in CI, not just present as config.
- Session/token lifecycle (6a2), authorization proof tests — IDOR,
  admin-boundary, multi-tenant isolation (6a3), file-upload/SSRF/error-
  handling hardening (6a4), payments/webhook integrity (6a5, if the
  product has payments), and the pages/UX-state audit (6a6, every
  `APPLICABLE_MISSING` page built and reachable) all pass as e2e tests,
  not just as implemented code — each is a required test in the suite,
  not a manual assertion.
- Strix runtime pentest (section 6b) exits 0 or every validated finding is
  fixed and the re-run is clean.
- The full checklist validation pass (section 6c) has been re-run against
  the actual codebase/running app and every item is checked off, not
  assumed from earlier in the loop.
- Docker + CI + deploy config exist and are runnable. README documents run.
- **Backup & disaster recovery are tested, not just configured**:
  automated database backups run on a schedule (documented retention
  policy — how long, how many); a restore has actually been exercised
  once against a scratch database this run (not assumed from the backup
  job's exit code) and the row counts/data checked, not just "the file
  exists"; `docs/DEPLOYMENT.md` (or a dedicated disaster-recovery doc)
  names the recovery owner/procedure and lists any other critical files
  (uploaded assets, generated exports) that also need backing up beyond
  the database. A backup that has never been restored is not proven
  recovery capability — treat it as failing this gate until restored once.
- Env contract verified: `prd.json.envVars` is canonical and mirrored
  var-for-var in `.env.example` and the env module; the app boots with
  credentials unset (integrations visibly gated OFF, no crash, no fake
  success). AI is proven live via the mock-AI test double; for providers
  with no sandbox credential (Stripe/email/S3) the wiring is verified by
  review against the SDK contract + env-gate flip-on-presence — the final
  live call happens on the user's first run with a real key.
- Final browser check: the app boots, authenticates, and its core flows
  work end-to-end with real persisted data.
- Nothing was pushed to a remote, no PR was opened, no shared system was
  touched — everything is local commits on the feature branch.
- You report honestly: what shipped (all stories, or PARTIAL + remaining
  count if a budget cap stopped the loop early), what is env-gated
  (credentials the user must supply, read from
  `scripts/ralph/.admin-credentials`/`.env`, never restated inline), the
  one command to run it, and total cost/tokens for the run (`opencode
  stats --days 1`).

## 7b. AI agent self-audit (answer before declaring ANY story or the final build complete)

Evidence over assertion. Before marking a `prd.json` story `passes: true`,
and again before the final COMPLETE report, answer all 20 explicitly —
"ran clean" is not evidence, the actual command output is:

1. What files did you change?
2. What functionality did you add?
3. What existing functionality could have been affected?
4. Did you modify the database schema? If yes, where is the migration?
5. Are authentication and authorization enforced on every new/changed
   endpoint (name the check, don't just assert it)?
6. Are all external inputs validated (which schema, at which boundary)?
7. Are any secrets exposed (grep the diff for likely key patterns)?
8. Are there any mock APIs or placeholder implementations in this change?
9. Did you run the tests? Paste the pass/fail count.
10. Did you run lint? Paste the result.
11. Did you run type checking? Paste the result.
12. Did you run the production build? Paste the result.
13. What errors remain (if any)?
14. What assumptions did you make (point at the `docs/DECISIONS.md` entry
    or code comment)?
15. What security risks did you identify in this change?
16. What performance risks did you identify in this change?
17. Is this feature actually production-ready, or does it have a known gap?
18. What still needs human verification (real payment/OAuth credential,
    a real inbox for email delivery, etc.)?
19. Provide the evidence (command output, file path, screenshot reference)
    for each PASS claim above — a claim with no evidence is treated as
    unverified, not as done.
20. (Final report only) Would you personally deploy this to production
    right now, unattended? If no, say exactly why not.

## 7c. Final production gate (GO / NO-GO — include this table in the final report)

| Area | Status |
|---|---|
| Requirements | |
| Architecture | |
| Database | |
| Authentication | |
| Authorization | |
| API | |
| Frontend | |
| UX | |
| Security | |
| AI | |
| Integrations | |
| File handling | |
| Background jobs | |
| Testing | |
| Performance | |
| Monitoring | |
| CI/CD | |
| Deployment | |
| Backup/Recovery | |
| Accessibility | |
| Privacy | |
| Documentation | |

Fill every row PASS or NO-GO (never blank, never "N/A" without a one-line
reason it doesn't apply to this product) from the actual section 6/6a/6c
evidence above — don't restate the plan. A single CRITICAL issue, HIGH
issue, test failure, or security failure in ANY row is a NO-GO for the
whole build: report PARTIAL with the failing rows named, not COMPLETE.

## 8. References

Section 6a6's pages/UX-state audit is adapted from a general "audit and
complete all applicable production pages" methodology: evidence-based
applicability, never-invent-facts, `docs/PRODUCTION_PAGE_AUDIT.md` as the
deliverable, and legal/lifecycle/UX-state checklists gated on what the app
actually does — not mechanical page-per-checklist-item generation.

The security minimums in section 6/6a2-6a5 are cross-checked against these
external vibe-coding security checklists (industry postmortems of real
breaches — Lovable CVE-2025-48757, Base44 auth bypass, Replit prod-DB
deletion, Tea app open storage bucket — not just theoretical advice):

- Supabase — [The Vibe Coding Master Checklist](https://supabase.com/blog/the-vibe-coding-master-checklist)
- VibeAudits — [Vibe-Coded App Security Checklist](https://vibeaudits.com/blog/vibe-coded-app-security-checklist)
- Fourmeta — [Vibe Coding Security Checklist](https://www.fourmeta.com/blog/vibe-coding-security-checklist)
- Cycode — [Vibe Coding Security](https://cycode.com/blog/vibe-coding-security/)
- CatDoes — [Vibe Coding Security Checklist](https://catdoes.com/blog/vibe-coding-security-checklist)
