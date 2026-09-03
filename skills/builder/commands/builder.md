---
description: End-to-end idea-to-production-app orchestrator. Delegates to the `builder` skill. Use when the user invokes /builder with an idea.
---

Invoke the `builder` skill with the arguments provided to this command.

Pass the full `$ARGUMENTS` text to the skill as the idea. The skill owns the
hands-free pipeline (Prerequisites -> Dependency install -> Phase 0 toolchain
refresh -> Phase 1 brief + docs -> Phase 2 ralph loop -> Phase 3 final gates ->
Report). Do not duplicate any of its rules — load `skills/builder/SKILL.md` and
follow it.

If `$ARGUMENTS` is empty, stop and reply: "give me an idea to build — /builder <app idea>"