#!/usr/bin/env node
// ralph-runner-parallel.mjs — EXPERIMENTAL swarm-style ralph: runs multiple
// independent stories concurrently, each in its own git worktree/branch, then
// merges them back one at a time. Opt-in; the sequential ralph-runner.mjs
// remains the default and the recommended path for most builds.
//
// Requires prd.json stories to optionally declare `dependsOn: [ids]`
// (absent/empty = no dependency, ready as soon as it's `passes: false`).
// A story with unmet dependsOn never enters the ready "frontier" — it is
// simply not picked up until its dependencies land.
//
// Concurrency-safety model (deliberately conservative, matches the
// single-writer philosophy of ralph-runner.mjs): worker iterations run in
// isolated worktrees and are told NEVER to edit prd.json — only this
// supervisor process flips `passes: true`, and only AFTER a successful
// merge + quality gate. This sidesteps prd.json merge conflicts entirely
// (workers never touch the file) instead of trying to reconcile concurrent
// JSON edits.
//
// Merges are serialized (one at a time, never concurrent) even though the
// iterations that produced them ran in parallel — this is the actual hard
// constraint on how much parallelism helps: N stories can be IMPLEMENTED
// concurrently, but they still integrate one at a time, and a merge
// conflict or a failing quality gate on one story does not block the
// others already queued to merge.
//
// Usage: node ralph-runner-parallel.mjs [max_rounds]
//   env: RALPH_MAX_PARALLEL (default 3), RALPH_MERGE_GATE_CMD (optional
//        shell command run after each merge, e.g. "npm run build && npm test";
//        a non-zero exit reverts the merge), RALPH_ITERATION_TIMEOUT_MS,
//        RALPH_IDLE_TTL_MS (same meaning as ralph-runner.mjs).
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const prdFile = path.join(projectRoot, "prd.json");
const promptFile = path.join(scriptDir, "RALPH.md");
const logFile = path.join(scriptDir, "ralph.log");
const backendFile = path.join(scriptDir, ".backend");
const pidFile = path.join(scriptDir, ".ralph.pid");
const stateFile = path.join(scriptDir, "heartbeat.state");
const haltFile = path.join(scriptDir, ".halt");
const lockDir = path.join(scriptDir, ".ralph.lock");
const worktreeParent = path.resolve(projectRoot, "..");

const maxRounds = Number(process.argv[2] ?? 50);
const maxParallel = Math.max(1, Number(process.env.RALPH_MAX_PARALLEL ?? 3));
const mergeGateCmd = process.env.RALPH_MERGE_GATE_CMD ?? "";
const completionGateCmd = process.env.RALPH_COMPLETION_GATE_CMD ?? "";
const timeoutMs = Number(process.env.RALPH_ITERATION_TIMEOUT_MS ?? 2_700_000);
const idleTtlMs = Number(process.env.RALPH_IDLE_TTL_MS ?? 900_000);
const idlePollMs = 5_000;

const log = async (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  await appendFile(logFile, `${line}\n`);
  process.stdout.write(`${line}\n`);
};
const readPrd = async () => JSON.parse(await readFile(prdFile, "utf8"));
const writePrd = async (prd) => writeFile(prdFile, `${JSON.stringify(prd, null, 2)}\n`);

function sh(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8" });
}

function runCompletionGate() {
  if (!completionGateCmd) return { status: 0 };
  return spawnSync(completionGateCmd, {
    cwd: projectRoot,
    env: process.env,
    shell: true,
    encoding: "utf8",
    timeout: Number(process.env.RALPH_COMPLETION_GATE_TIMEOUT_MS ?? 900_000),
  });
}

function isProcessAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  if (process.platform === "win32") {
    return spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { stdio: "pipe", windowsHide: true }).stdout?.toString().includes(String(pid)) ?? false;
  }
  // EPERM means the pid exists but is owned by another user. That's still
  // "alive" for lock-safety purposes.
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

function findBackend() {
  const recordedName = existsSync(backendFile) ? readFileSync(backendFile, "utf8").trim() : "";
  const which = process.platform === "win32" ? "where" : "which";
  if (recordedName) {
    if (spawnSync(which, [recordedName], { stdio: "ignore" }).status !== 0) {
      throw new Error(`recorded backend ${recordedName} is no longer available on PATH; restore it before resuming`);
    }
    return recordedName;
  }
  for (const candidate of ["opencode", "claude", "codex"]) {
    if (spawnSync(which, [candidate], { stdio: "ignore" }).status === 0) return candidate;
  }
  throw new Error("No supported headless backend found on PATH (need opencode, claude, or codex)");
}

function commandFor(backend, dir, prompt) {
  if (backend === "opencode") return ["opencode", ["run", "--dir", dir, "--auto", "--format", "default", prompt]];
  if (backend === "claude") return ["claude", ["-p", prompt, "--dangerously-skip-permissions", "--add-dir", dir]];
  if (backend === "codex") return ["codex", ["exec", "--cd", dir, "--full-auto", prompt]];
  throw new Error(`Unsupported backend: ${backend}`);
}

async function acquireLock() {
  try {
    await mkdir(lockDir);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existingPid = existsSync(pidFile) ? Number((readFileSync(pidFile, "utf8") || "").trim()) : 0;
    if (isProcessAlive(existingPid)) {
      throw new Error(`another parallel ralph runner is already running for ${projectRoot} (pid ${existingPid})`);
    }
    await rm(lockDir, { recursive: true, force: true });
    await mkdir(lockDir);
  }
  await writeFile(pidFile, `${process.pid}\n`);
}

function readyFrontier(prd, blocked) {
  const passesById = new Map(prd.userStories.map((s) => [s.id, s.passes === true]));
  return prd.userStories.filter((story) => {
    if (story.passes !== false || blocked.has(story.id)) return false;
    const deps = Array.isArray(story.dependsOn) ? story.dependsOn : [];
    return deps.every((depId) => passesById.get(depId) === true);
  });
}

function worktreeExists(dir) {
  const list = sh("git", ["worktree", "list", "--porcelain"], projectRoot);
  return list.status === 0 && list.stdout.includes(dir);
}

async function runWorkerIteration(backend, dir, prompt) {
  const [command, args] = commandFor(backend, dir, prompt);
  const child = spawn(command, args, { cwd: dir, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  const stopChild = () => {
    if (!child.pid) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
    setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, 5000).unref();
  };
  let lastOutputAt = Date.now();
  const stream = (chunk) => { lastOutputAt = Date.now(); return appendFile(logFile, chunk.toString()); };
  child.stdout.on("data", stream);
  child.stderr.on("data", stream);
  return new Promise((resolve) => {
    const hardTimer = setTimeout(() => { stopChild(); }, timeoutMs);
    const idleTimer = setInterval(() => {
      if (Date.now() - lastOutputAt >= idleTtlMs) { clearInterval(idleTimer); stopChild(); }
    }, idlePollMs);
    idleTimer.unref?.();
    child.on("close", (code) => { clearTimeout(hardTimer); clearInterval(idleTimer); resolve(code); });
    child.on("error", () => { clearTimeout(hardTimer); clearInterval(idleTimer); resolve(1); });
  });
}

async function implementStoryInWorktree(backend, story, baseBranch) {
  const branch = `ralph/story-${story.id}`;
  const dir = path.join(worktreeParent, `${path.basename(projectRoot)}-worktree-${story.id}`);
  if (worktreeExists(dir)) {
    return { story, dir, branch, committed: false, blocked: true, reason: `worktree ${dir} already registered (leftover from a prior failed merge) — resolve or remove it manually before retrying this story` };
  }
  try {
    const add = sh("git", ["worktree", "add", "-B", branch, dir, baseBranch], projectRoot);
    if (add.status !== 0) {
      return { story, dir, branch, committed: false, blocked: true, reason: `git worktree add failed: ${(add.stderr || "").trim()}` };
    }
    const prompt = `${await readFile(promptFile, "utf8")}\n\n---\nPARALLEL-MODE CONSTRAINT: implement ONLY user story ${story.id} ("${story.title}") from prd.json. Do not touch any other story. Do NOT edit prd.json yourself — the supervisor flips its passes flag after merging and verifying your work. Commit your changes on this branch (Conventional Commits) when the story's acceptance criteria are met.`;
    await runWorkerIteration(backend, dir, prompt);
    const headBeforeRes = sh("git", ["rev-parse", baseBranch], projectRoot);
    const headAfterRes = sh("git", ["rev-parse", branch], dir);
    if (headBeforeRes.status !== 0 || headAfterRes.status !== 0) {
      return { story, dir, branch, committed: false, blocked: false, reason: "could not read worktree HEAD after iteration (worker may have left the worktree in a broken state)" };
    }
    const committed = headAfterRes.stdout.trim() !== headBeforeRes.stdout.trim();
    return { story, dir, branch, committed, blocked: false };
  } catch (error) {
    return { story, dir, branch, committed: false, blocked: false, reason: `worker iteration threw: ${error.message}` };
  }
}

async function mergeAndVerify(result, baseBranch, prd, blocked) {
  const { story, dir, branch, committed, blocked: preBlocked, reason } = result;
  if (preBlocked) {
    blocked.add(story.id);
    await log(`story ${story.id}: BLOCKED — ${reason}`);
    return false;
  }
  if (!committed) {
    await log(`story ${story.id}: no commits produced in ${branch}${reason ? ` (${reason})` : ""} — leaving unmerged, will retry next round`);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    sh("git", ["worktree", "prune"], projectRoot);
    sh("git", ["branch", "-D", branch], projectRoot);
    return false;
  }
  sh("git", ["checkout", baseBranch], projectRoot);
  const merge = sh("git", ["merge", "--no-ff", "-m", `merge: ralph story ${story.id}`, branch], projectRoot);
  if (merge.status !== 0) {
    sh("git", ["merge", "--abort"], projectRoot);
    blocked.add(story.id);
    await log(`story ${story.id}: BLOCKED — merge conflict against ${baseBranch}; leaving worktree ${dir} / branch ${branch} for manual resolution`);
    return false;
  }
  if (mergeGateCmd) {
    const gate = spawnSync(mergeGateCmd, {
      cwd: projectRoot,
      env: process.env,
      shell: true,
      encoding: "utf8",
    });
    if (gate.status !== 0) {
      blocked.add(story.id);
      await log(`story ${story.id}: BLOCKED — merge gate failed ("${mergeGateCmd}"); reverting merge, leaving branch ${branch} for inspection`);
      sh("git", ["reset", "--keep", "HEAD~1"], projectRoot);
      return false;
    }
  }
  const target = prd.userStories.find((s) => s.id === story.id);
  if (target) target.passes = true;
  await writePrd(prd);
  sh("git", ["add", "prd.json"], projectRoot);
  sh("git", ["commit", "-m", `chore: mark ${story.id} passes:true`], projectRoot);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  sh("git", ["worktree", "prune"], projectRoot);
  sh("git", ["branch", "-D", branch], projectRoot);
  await log(`story ${story.id}: merged, gated, and marked passes:true`);
  return true;
}

async function main() {
  await mkdir(scriptDir, { recursive: true });
  let prd = await readPrd();
  if (!prd.project || !prd.branchName || !Array.isArray(prd.userStories) || prd.userStories.length === 0) {
    throw new Error("prd.json is not ralph-shaped");
  }
  const backend = findBackend();
  await writeFile(backendFile, `${backend}\n`);
  const existingPid = existsSync(pidFile) ? Number((readFileSync(pidFile, "utf8") || "").trim()) : 0;
  if (isProcessAlive(existingPid)) {
    throw new Error(`another parallel ralph runner is already running for ${projectRoot} (pid ${existingPid}) — refusing to start a second loop`);
  }
  await acquireLock();
  await writeFile(stateFile, "RUNNING\n");
  await log(`Starting PARALLEL ralph runner (${backend}, max_parallel=${maxParallel}) — project: ${projectRoot}`);
  const baseBranchRes = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], projectRoot);
  const baseBranch = (baseBranchRes.status === 0 && baseBranchRes.stdout.trim()) || prd.branchName;
  const blocked = new Set(); // stories that hit a real merge conflict / failed gate / leftover worktree this run — never auto-retried

  try {
    for (let round = 1; round <= maxRounds; round += 1) {
      if (existsSync(haltFile)) { await log(`Ralph halted by ${haltFile} at round ${round}.`); process.exitCode = 1; return; }
      prd = await readPrd();
      const open = prd.userStories.filter((s) => s.passes === false);
      if (open.length === 0) {
        const gate = runCompletionGate();
        if (gate.status !== 0) throw new Error("completion gate failed; inspect its output before retrying");
        await log("Ralph completed all stories.");
        await writeFile(stateFile, "DONE\n");
        return;
      }
      const frontier = readyFrontier(prd, blocked);
      if (frontier.length === 0) {
        throw new Error(`round ${round}: ${open.length} stories open (${blocked.size} blocked: ${[...blocked].join(", ") || "none"}) but none are ready — check dependsOn for a cycle/unmet id, or resolve the blocked stories manually`);
      }
      const batch = frontier.slice(0, maxParallel);
      await log(`----- round ${round}: implementing ${batch.map((s) => s.id).join(", ")} concurrently (${open.length} open total) -----`);
      const results = await Promise.all(batch.map((story) => implementStoryInWorktree(backend, story, baseBranch)));
      let anyMerged = false;
      for (const result of results) {
        prd = await readPrd(); // re-read: earlier merges in this same round already advanced it
        const merged = await mergeAndVerify(result, baseBranch, prd, blocked);
        anyMerged = anyMerged || merged;
      }
      if (!anyMerged) {
        await log(`round ${round}: no story in this batch merged cleanly — stopping to avoid burning further rounds on the same conflict/gate failure`);
        throw new Error(`a full round produced zero successful merges (blocked: ${[...blocked].join(", ") || "none"}); inspect leftover worktrees/branches above`);
      }
    }
    throw new Error(`Ralph reached max rounds (${maxRounds}) with stories still open`);
  } finally {
    await rm(pidFile, { force: true });
    await rm(lockDir, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  await writeFile(stateFile, "FAILED\n");
  await log(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
