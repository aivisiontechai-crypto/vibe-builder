---
name: vibe-docs
description: "Use when the user describes a new product, app, SaaS, or feature idea and wants it turned into the full set of product and engineering docs - BRD, PRD, technical architecture, data model, API spec, DESIGN.md, security plan, test plan, deployment runbook. Also use when they say \"turn my idea into a fullstack app\", \"build docs for my idea\", \"write the prd and brd\", \"vibe coding\", \"give me an idea\", or paste a short concept and want it fleshed out. Idea-to-docs is hands-free: ask NO clarifying questions, make the decisive assumptions yourself, and record them. Do NOT write application code - docs only; the vibe-build skill consumes these docs."
---

# vibe-docs — idea → complete product & engineering docs

Turn a raw idea into a complete, actionable `docs/` package that a
hands-free agent can build the entire application from. Zero questions to
the user, decisive choices, every assumption recorded.

## 0. Mood (this is HOW you operate)

- You are the founder + PM + architect. Decide, don't interview.
- If the user's idea is thin, fill it in with the mainstream, commercially
  sensible interpretation. An ambiguous market means: B2C first, web-first,
  freemium with a paid tier.
- One pass, no back-and-forth. Record EVERY choice you made that the user
  didn't state in `docs/DECISIONS.md`.
- The docs are the contract for the next phase (vibe-build). They must be
  concrete enough that a different agent, shown only `docs/`, builds the
  right thing. No adjectives without numbers, no requirements without
  acceptance criteria.
- If the user says "everything", push for apps = product for end users.
- Any feature you cannot fully specify? Specify it anyway at the level you
  can, mark it `[assumption]`, keep the requirement crisp.

## 1. Extract the idea (5 minutes of thinking, not 5 questions)

If a `BRIEF.md` exists at the project root, it is the authoritative statement
of the idea (shaped by prompt-architect): derive every dimension from it,
don't re-interpret the one-liner. Otherwise derive from the one-liner below.

From the one-liner, derive and commit to:

| Dimension | Your job — don't ask |
|---|---|
| Vision | One sentence: "X for Y so that Z." |
| Target user | Primary persona (name, role, frustration, goal). |
| Problem & value | The job-to-be-done and the wedge that wins. |
| Core features | The 3–7 highest-priority capabilities the product MUST ship. Rank them. |
| User roles & permissions | Every distinct role (e.g. admin/owner/member/guest) and exactly what each can view/create/edit/delete — spec this even for a single-role app ("user" + implicit "admin"). |
| Out of scope | What you explicitly refuse to build (v1). |
| Platform & stack | Web-first unless the idea explicitly requires a native mobile
  experience (offline-first, camera/GPS/push/biometrics, app-store
  distribution) — decide `web`, `mobile`, or `web+mobile` HERE, decisively,
  and record which in `DECISIONS.md`; do not leave it implicit for
  `vibe-build` to guess. |
| Monetization | Freemium unless the domain says otherwise. |
| Success metrics | Numbers for launch week, quarter 1, year 1 (activation, retention, revenue). |

If the installed `idea-refine` and `spec-driven-development` skills exist,
use their structure as the rigor backbone — but do NOT let them make you ask
interview questions. You answer them.

**Standalone dependency check** (skip if invoked via the `builder` skill —
it already ran this): if `design-taste-frontend`, `ui-ux-pro-max`, or
`impeccable` is not installed under `~/.opencode/skills/`,
`~/.claude/skills/`, or
`~/.agents/skills/`, install it now — `CI=1 npx -y skills add
Leonxlnx/taste-skill@design-taste-frontend -g -y` for the design-taste
skill — before reaching the DESIGN.md step, rather than discovering the
gap mid-write.

## 2. The fixed stack default (record it in DECISIONS.md)

Be decisive and boring. Deviate only when the feature set makes it
objectively wrong, then record the deviation:

- **App**: Next.js (App Router) + TypeScript (strict) fullstack monolith.
- **UI**: Tailwind CSS v4 + shadcn/ui primitives. Design token-driven.
- **Data**: PostgreSQL + Prisma (real migrations). No in-memory stores.
- **API**: Next.js Route Handlers + Zod validation at every boundary.
- **Auth**: Auth.js v5 (NextAuth), Argon2/bcrypt password hashing, httpOnly
  session cookies, CSRF protection, per-role server-side authorization.
- **Tests**: Vitest (unit/integration) + Playwright (e2e, real browser).
- **Deploy**: Dockerized; Vercel/Fly any-DB default; GitHub Actions CI/CD.
- **Ops**: structured logging, health/readiness endpoints, `npm audit`.
- **AI (mandatory in every product)**: OpenAI-compatible API, server-side
  only, called via the env module; the model + base URL are env-config
  (`AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY` — never proxied to the browser).
- **Every product ships an embedded AI chatbot AND at least one AI-assisted
  feature** (summaries, search, generation, classification…); they are core
  scope, not optional modules. The AI key stays env-gated per the env

### 2a. Mobile stack (only when Platform & stack above resolved to `mobile`
or `web+mobile` — skip entirely for web-only products)

- **App**: Expo (React Native) + TypeScript (strict), Expo Router for
  navigation. The Next.js Route Handlers above remain the ONE backend —
  the mobile client is a consumer of the same API/Zod contracts, never a
  second backend. Load `vercel-react-native-skills` for list-performance,
  animation, and native-module patterns before writing screens.
- **Auth on mobile**: same Auth.js-issued sessions via a token-based flow
  (short-lived JWT/refresh pair over HTTPS, stored in `expo-secure-store`,
  never `AsyncStorage` for secrets) — httpOnly cookies do not work in a
  native WebView-less RN client, so this is a deliberate, documented
  deviation from the web auth transport, not a weaker auth model.
- **Distribution**: EAS Build + EAS Submit for store builds; Expo Go /
  a dev client for local iteration. Record store-listing requirements
  (privacy policy URL, permissions usage strings, app icons/splash) in
  `docs/DEPLOYMENT.md` — app-store review is a real gate, not optional.
- **Testing**: same Vitest for shared/business logic; native e2e via
  Detox or Maestro (record the choice in `DECISIONS.md`) in place of
  Playwright for the mobile client — Playwright does not drive a native
  app.
- **`web+mobile`**: `prd.json` stories are split per-platform where the
  UI diverges (shared API/data-model stories land once) so ralph doesn't
  conflate a web-only story with a native-client one.
  contract.

This default is PRODUCTION-shaped, not demo-shaped. Doc it as such.

## 3. Produce the docs (write every file)

Create a `docs/` folder at the project root and write each file. Substantial
defaults, real content — no TBDs, no "to be decided", no lorem ipsum.

| File | What it must contain |
|---|---|
| `README.md` | **Docs index** (not the product readme): project one-liner, doc table of contents, how to read the set, where to start — and a link to the `prd.json` task list at the project root. The product quickstart README at the project root is written by vibe-build at ship time. |
| `BRD.md` | Business problem, goals + measurable objectives, success metrics, target market, personas, competitive positioning, monetization, stakeholders, constraints, risks, regulatory notes, THIRD-PARTY DEPENDENCIES + their cost/limits (payment, email, storage, AI providers). |
| `PRD.md` | User stories with acceptance criteria (Given/When/Then), full-product feature set (NO MVP ceiling — every feature in scope, phased only by delivery order), functional + non-functional requirements, UX principles, edge-case behaviors, analytics events to capture. Every story must be buildable and testable. An embedded AI chatbot (chat endpoint + streaming UI) and ≥1 AI-assisted feature are MANDATORY scope regardless of domain; spec them fully, key env-gated, AND spec their hallucination protections (below). |
| Antihallucination contract (spec in the AI stories) | Grounded answers with cited sources when the product holds the data (RAG over the real DB/docs; show sources); explicit "I don't have that" refusal instead of fabricated numbers/users/stats; chatbot can never perform a state mutation without in-UI human confirmation; conservative model temperature; AI output rendered as plain text only; per-user caps on AI calls. |
| `ARCHITECTURE.md` | Components, data flow, module boundaries, auth/session flow, error envelope, idempotency, scaling plan, deployment topology, fault-tolerance plan (retry/backoff/circuit-breaker for external calls, health/readiness endpoints, graceful shutdown, connection-pool limits). Ground the domain model using `domain-modeling` (glossary + ADRs under `docs/adr/`) and the shared vocabulary from `codebase-design` (module, interface, depth, seam, adapter) so later refactor passes (`improve-codebase-architecture` in vibe-build) speak the same language as this doc. |
| `DATA_MODEL.md` | Every entity, its fields, types, nullability, relations, indexes, unique constraints, soft-delete strategy, migrations plan. |
| `API_SPEC.md` | All endpoints: method, path, params, request/response schemas, auth requirement, error responses, rate limits, pagination. |
| `DESIGN.md` | Design system: brand direction, color roles, typography, spacing, components, motion, do/don't list. Produce this using the installed design skills — `ui-ux-pro-max` (run its design-system generator for the domain), `design-taste-frontend` (set the VARIANCE/MOTION/DENSITY dials you want), `impeccable` (anti-pattern grammar), and `frontend-design` (Anthropic's official skill — cross-check layout/typography/color fundamentals against it before finalizing). If a `@design-md` or `awesome-claude-design` reference collection exists, borrow direction from a matching brand, never clone it 1:1. |
| `SECURITY.md` | Threat model, authN/authZ scheme, session & cookie policy, data classification + PII handling, input validation, rate limiting, secrets management, dependency/container scanning, incident response, COMPLIANCE (GDPR/CCPA/rules that apply to THIS domain) + data residency. If personal data is collected, ground this in the installed `gdpr-data-handling` skill: real DSAR/erasure/portability workflows (not a support-ticket promise), retention policy with legal-basis tracking, a 72-hour breach-notification runbook, and privacy-by-design (data minimization, encryption/pseudonymization, PII separated from behavioral data). |
| `TEST_PLAN.md` | Unit/integration/e2e scope per module, the 10 e2e flows that must pass, coverage targets, how to run. |
| `DEPLOYMENT.md` | Environments, CI/CD pipeline, infra, env var table (with placeholders, never values) — the SAME exhaustive, per-var-commented table must exist as `.env.example` in the repo root so the user only ever pastes real values, migrations in deploy, monitoring, backup/restore, rollback. |
| `SCOPE.md` | **Full-product scope** — the complete feature set in delivery-order phases (platform → data → auth → core → full features → polish/audit), dependencies, definition of done per phase. NOT an MVP cut: nothing is deferred, only ordered. |
| `CHANGELOG.md` | Seeded at v0.1.0 — vibe-build appends a real entry (Added/Changed/Fixed) per shipped phase as the product is built, Keep a Changelog format. |
| `TROUBLESHOOTING.md` | Common failure modes and fixes: DB connection errors, migration conflicts, env var misconfiguration, auth/session issues, AI provider errors, webhook signature failures — written from the actual stack chosen, not generic boilerplate. |
| `DECISIONS.md` | Every assumption + choice you made and why. THIS IS MANDATORY — it is how you stay hands-free. |

### prd.json — the ralph task list (ALSO write this file)

Write `prd.json` at the **project root** — ralph drives the build from it.
Avatar of `SCOPE.md`: every feature, broken into SMALL stories, each small
enough for ONE fresh agent context to implement and verify:

```json
{
  "project": "project-name",
  "branchName": "ralph/feature-name",
  "description": "Full product build — <feature set summary>",
  "envVars": [
    { "name": "DATABASE_URL", "from": "auto", "description": "Postgres connection string",
      "example": "postgresql://app:app@localhost:5432/app" },
    { "name": "SESSION_SECRET", "from": "auto", "description": "Auth.js secret, random hex" , "example": "" },
    { "name": "AI_API_KEY", "from": "user", "description": "OpenAI-compatible API key", "example": "sk-..." }
  ],
  "userStories": [
    {
      "id": "US-001",
      "title": "Scaffold app with stack, app shell and CI",
      "description": "As a developer, I need tooling + app shell so every later story builds on a real base.",
      "acceptanceCriteria": [
        "Next.js + strict TS + Tailwind + shadcn scaffolded, dev server boots",
        "Prisma + Postgres connected, health endpoint reads the real DB",
        "typed env module (dotenv + Zod) exports every prd.json envVar; `.env.example` mirrors it var-for-var",
        "ESLint/Prettier/Vitest/Playwright configured, `npm run lint`, `tsc --noEmit`, `npm run build` pass",
        "security baseline in place (CSP/headers middleware, env validation, .env.gitignored)",
        "Committed: `feat: US-001 - Scaffold app with stack, app shell and CI`"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

Story-sizing rules (this is what makes hands-free work):

- **`envVars` is the canonical env contract.** Every runtime var the app
  needs is listed once here with `name`, `from: "auto"` (generated random
  secret / local URL) or `from: "user"` (real-account credential, stays
  EMPTY until pasted), `description`, and a placeholder `example`. This is
  the SINGLE source of truth: `DEPLOYMENT.md`'s env table, `.env.example`,
  and the env module all mirror it var-for-var. Doc the same names nowhere
  else — one name drift between docs-agent and build-agent is a broken
  run.

- **One story = one context window of work.** A column + migration is a
  story. A UI component on an existing page is a story. "Add
  authentication" is TOO BIG — split it (registration → email confirm →
  login → session + protected route → RBAC). Same for "build the dashboard".
- Every story is independently verifiable: state the typecheck/lint/test
  gates in `acceptanceCriteria`, and `Verify in browser using agent-browser
  skill` for anything that touches UI. AI stories state their gate as
  `chat e2e passes against the local mock-AI test double (real key NOT
  required)` — so an unset `AI_API_KEY` can never stall them.
- Order by `priority`: scaffolding and the security baseline FIRST (US-001
  scaffold, US-002 data+health, US-003 auth core...), full features next,
  ALWAYS the AI stories (AI env module + chat API with server-side
  streaming, rate limits and Zod validation, then the chatbot UI wired to
it), and ALWAYS a final story: "Run impeccable/design-taste-frontend design
   audit and security-and-hardening audit against the whole app; fix every
   CRITICAL/HIGH finding; Strix pentest of the running app exits clean
   (fix & re-verify any validated findings); full e2e suite green in a real
   browser."
- Wipe out the MVP habit: the product ships COMPLETE. `passes` in this
  file drives the loop until every story is done.

### Design-skills ritual for DESIGN.md
1. Load `ui-ux-pro-max` (or its search script) and generate the domain's
   design system — it is built exactly for "spa landing" → tokens in.
2. Open `design-taste-frontend` and fix the three dials (defaults:
   VARIANCE 6, MOTION 5, DENSITY 5), then apply its anti-slop rules to
   your design language.
3. Load `impeccable` and draft the Do/Don't list against its 61 detector
   rules so the design is not AI-slop.
4. Pick a brand reference from the installed design collections for
   direction, write an original system.
5. **Content/storytelling pass** (pattern reference: `instatic` for
   static/editorial publishing structure) — applies whenever the product
   has a marketing site, blog/content hub, or narrative landing page:
   write `DESIGN.md`'s content section as a real information architecture
   (hero narrative arc, section-by-section story beats, content hierarchy
   for long-form/editorial pages) instead of a flat wireframe list. This
   is a documentation step, not an installed dependency — no package add,
   no runtime code from the repo.
6. **Workspace/app-shell pass** — applies whenever the product is a
   dashboard, internal tool, or multi-surface app shell: record the
   shell's navigation model (sidebar/command-palette/workspace-switcher
   conventions) in `DESIGN.md` so vibe-build scaffolds one consistent
   shell instead of ad-hoc per-page layouts. (Not attributed to `skylos`
   — corrected 2026-09-07: that repo is a PR dead-code/security scanner,
   unrelated to workspace UX; this step stands on its own merit.)

## 4. Definition of done (docs phase)

- All files above exist under `docs/` with substantive content.
- `prd.json` exists at the project root in ralph format; every story is
  small (context-window-sized), has concrete acceptance criteria incl.
  quality gates, and `passes: false`.
- Every decision is in `DECISIONS.md`. Zero open questions for the user.
- Every user story has acceptance criteria. Every endpoint is specified.
- README links/orders the docs; files cross-reference each other; no
  "TBD", "lorem ipsum", or unresolved placeholders anywhere in `docs/`.
- The index README makes clear this is docs-only; the product README is
  shipped later by vibe-build.
- If run by the builder pipeline, continue DIRECTLY into vibe-build — do
  NOT stop to ask "want me to build it?". Only when run standalone (the
  user asked for docs only) close with a one-line pointer to vibe-build
  and stop.

> This skill writes docs only. When the user then says build/implement, the
> `vibe-build` skill takes over and reads `docs/`.
