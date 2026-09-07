#!/usr/bin/env node
// Cross-platform ralph runner. The .sh files remain for POSIX compatibility.
import { appendFile, mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const iterationPidFile = path.join(scriptDir, ".iteration.pid");
const lockDir = path.join(scriptDir, ".ralph.lock");
const stateFile = path.join(scriptDir, "heartbeat.state");
const haltFile = path.join(scriptDir, ".halt");
const maxLogBytes = Number(process.env.RALPH_MAX_LOG_BYTES ?? 2_000_000);
const retainLogBytes = Number(process.env.RALPH_RETAIN_LOG_BYTES ?? 1_500_000);
const maxIterations = Number(process.argv[2] ?? 200);
const timeoutMs = Number(process.env.RALPH_ITERATION_TIMEOUT_MS ?? 2_700_000);
// idle self-heal: kill an iteration whose log output has gone silent for
// this long, even though the hard timeoutMs cap hasn't been hit yet — this
// is the Node-runner equivalent of ralph-heartbeat.sh's IDLE_TTL watchdog,
// so the cross-platform path (the only supported one on Windows) also
// self-heals a hung-but-alive backend instead of waiting out the full cap.
const idleTtlMs = Number(process.env.RALPH_IDLE_TTL_MS ?? 900_000);
const idlePollMs = Number(process.env.RALPH_IDLE_POLL_MS ?? 5_000);
const completionGateCmd = process.env.RALPH_COMPLETION_GATE_CMD ?? "";

const log = async (message) => {
  await appendFile(logFile, `${message}\n`);
  process.stdout.write(`${message}\n`);
};
const readPrd = async () => JSON.parse(await readFile(prdFile, "utf8"));
const storySnapshot = (prd) => prd.userStories.map(({ id, passes }) => ({ id, passes }));
const openStories = (prd) => prd.userStories.filter((story) => story.passes === false);

function isProcessAlive(pid) {
  if (!pid) return false;
  if (process.platform === "win32") {
    return spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { stdio: "pipe", windowsHide: true }).stdout?.toString().includes(String(pid)) ?? false;
  }
  // EPERM means the pid exists but is owned by another user (we just can't
  // signal it) — that's still "alive" for lock purposes. Only ESRCH (no
  // such process) means the lock is stale and reclaimable.
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

async function boundLog() {
  try {
    const st = await stat(logFile);
    if (st.size > maxLogBytes) {
      const fd = await open(logFile, "r");
      try {
        const { buffer } = await fd.read({ length: retainLogBytes, position: st.size - retainLogBytes, buffer: Buffer.alloc(retainLogBytes) });
        await fd.close();
        await writeFile(logFile, buffer.toString("utf8"));
      } catch { await fd.close().catch(() => {}); }
    }
  } catch { /* log file absent or unreadable — not fatal */ }
}

function findBackend() {
  const recordedName = existsSync(backendFile) ? readFileSync(backendFile, "utf8").trim() : "";
  if (recordedName) {
    const available = spawnSync(process.platform === "win32" ? "where" : "which", [recordedName], { stdio: "ignore" }).status === 0;
    if (!available) throw new Error(`recorded backend ${recordedName} is no longer available on PATH; restore it before resuming`);
    return recordedName;
  }
  for (const candidate of ["opencode", "claude", "codex"]) {
    const probe = spawnSync(process.platform === "win32" ? "where" : "which", [candidate], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No supported headless backend found on PATH (need opencode, claude, or codex)");
}

function commandFor(backend, prompt) {
  if (backend === "opencode") return ["opencode", ["run", "--dir", projectRoot, "--auto", "--format", "default", prompt]];
  if (backend === "claude") return ["claude", ["-p", prompt, "--dangerously-skip-permissions", "--add-dir", projectRoot]];
  if (backend === "codex") return ["codex", ["exec", "--cd", projectRoot, "--full-auto", prompt]];
  throw new Error(`Unsupported backend: ${backend}`);
}

function git(args) {
  return spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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

function assertOnExpectedBranch(expectedBranch) {
  const result = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const actualBranch = result.status === 0 ? result.stdout.trim() : "";
  if (actualBranch !== expectedBranch) {
    throw new Error(`runner must start on branch ${expectedBranch}, currently on ${actualBranch || "unknown"}`);
  }
}

function assertCleanWorktree() {
  const result = git(["status", "--porcelain"]);
  if (result.status !== 0) throw new Error(`could not inspect git worktree: ${result.stderr.trim()}`);
  if (result.stdout.trim()) {
    throw new Error("refusing to run with a dirty worktree; commit or stash unrelated changes before starting ralph");
  }
}

async function acquireLock() {
  try {
    await mkdir(lockDir);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existingPid = existsSync(pidFile) ? Number((readFileSync(pidFile, "utf8") || "").trim()) : 0;
    if (isProcessAlive(existingPid)) {
      throw new Error(`another ralph runner is already running for ${projectRoot} (pid ${existingPid}) — refusing to start a second loop`);
    }
    await rm(lockDir, { recursive: true, force: true });
    await mkdir(lockDir);
  }
  await writeFile(pidFile, `${process.pid}\n`);
}

async function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5000).unref();
  }
}

async function runIteration(backend, prompt) {
  const [command, args] = commandFor(backend, prompt);
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await writeFile(iterationPidFile, String(child.pid));
  let lastOutputAt = Date.now();
  const stream = (chunk) => { lastOutputAt = Date.now(); return appendFile(logFile, chunk.toString()); };
  child.stdout.on("data", stream);
  child.stderr.on("data", stream);
  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      await log(`iteration pid ${child.pid} exceeded ${timeoutMs}ms; terminating`);
      await stopProcess(child);
    }, timeoutMs);
    const idleWatchdog = setInterval(async () => {
      if (Date.now() - lastOutputAt >= idleTtlMs) {
        await log(`iteration pid ${child.pid} silent > ${idleTtlMs}ms — killing to force a fresh iteration`);
        clearInterval(idleWatchdog);
        await stopProcess(child);
      }
    }, idlePollMs);
    idleWatchdog.unref?.();
    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      clearInterval(idleWatchdog);
      await rm(iterationPidFile, { force: true });
      resolve({ code, signal });
    });
    child.on("error", async (error) => {
      clearTimeout(timer);
      clearInterval(idleWatchdog);
      await rm(iterationPidFile, { force: true });
      await log(`backend failed to start: ${error.message}`);
      resolve({ code: 1, signal: null });
    });
  });
}

async function main() {
  if (!Number.isInteger(maxIterations) || maxIterations < 1) throw new Error("max iterations must be a positive integer");
  await mkdir(scriptDir, { recursive: true });
  const initial = await readPrd();
  if (!initial.project || !initial.branchName || !Array.isArray(initial.userStories) || initial.userStories.length === 0) throw new Error("prd.json is not ralph-shaped");
  const backend = findBackend();
  const prompt = await readFile(promptFile, "utf8");
  assertOnExpectedBranch(initial.branchName);
  assertCleanWorktree();
  await acquireLock();
  await writeFile(backendFile, `${backend}\n`);
  await writeFile(stateFile, "RUNNING\n");
  await log(`Starting cross-platform ralph runner (${backend}) — max ${maxIterations} iterations — project: ${projectRoot}`);
  try {
    let previousOpen = Number.POSITIVE_INFINITY;
    let stalls = 0;
    // consecutive-crash self-heal: if the backend process itself keeps
    // exiting non-zero (crash, auth failure, OOM, quota error) it will
    // never touch prd.json, so the story-based stall detector below never
    // fires and the loop would otherwise burn all maxIterations one dead
    // iteration at a time. Fail fast instead with a diagnostic pointing at
    // the log, after a small number of retries to absorb transient errors.
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = Number(process.env.RALPH_MAX_CONSECUTIVE_FAILURES ?? 3);
    if (openStories(initial).length === 0) {
      const gate = runCompletionGate();
      if (gate.status !== 0) throw new Error("completion gate failed; inspect its output before retrying");
      await writeFile(stateFile, "DONE\n");
      return;
    }
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      // clean stop: a supervisor drops scripts/ralph/.halt to stop the loop
      if (existsSync(haltFile)) {
        await log(`Ralph halted by ${haltFile} at iteration ${iteration}.`);
        process.exitCode = 1;
        return;
      }
      const before = storySnapshot(await readPrd());
      const headBefore = git(["rev-parse", "HEAD"]).stdout.trim();
      await log(`----- iteration ${iteration}/${maxIterations} (${backend}) -----`);
      const { code, signal } = await runIteration(backend, prompt);
      await boundLog();
      if (code !== 0) {
        consecutiveFailures += 1;
        await log(`iteration pid exited non-zero (code ${code}, signal ${signal ?? "none"}) — backend failure ${consecutiveFailures}/${maxConsecutiveFailures}`);
        if (consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(`backend failed ${consecutiveFailures} consecutive iterations in a row (last exit code ${code}) — check ${logFile} for the root cause before retrying`);
        }
      } else {
        consecutiveFailures = 0;
      }
      const afterPrd = await readPrd();
      assertOnExpectedBranch(afterPrd.branchName);
      assertCleanWorktree();
      const headAfter = git(["rev-parse", "HEAD"]).stdout.trim();
      const after = storySnapshot(afterPrd);
      const open = openStories(afterPrd);
      // structural integrity only: the story set (ids) must not change.
      // One or more false->true flips landing together (coupled stories) is
      // legitimate, and so is a true->false revert if a regression was
      // found — those are not corruption. A 0-flip iteration is handled by
      // the stall detector below, not flagged as corrupt here.
      const afterById = new Map(after.map((story) => [story.id, story.passes]));
      const sameStorySet = before.length === after.length && before.every((story) => afterById.has(story.id));
      if (!sameStorySet) throw new Error("iteration changed prd.json's story set (added/removed/renamed ids)");
      const falseToTrue = before.filter((story) => story.passes === false && afterById.get(story.id) === true).length;
      if (falseToTrue > 0 && headBefore === headAfter) {
        throw new Error("iteration marked stories complete without producing a git commit");
      }
      if (falseToTrue === 0 && open.length > 0) await log("iteration made no valid story transition");
      if (open.length === 0) {
        const gate = runCompletionGate();
        if (gate.status !== 0) {
          throw new Error("completion gate failed; inspect its output before retrying");
        }
        await log("Ralph completed all stories.");
        await writeFile(stateFile, "DONE\n");
        return;
      }
      stalls = open.length >= previousOpen ? stalls + 1 : 0;
      previousOpen = open.length;
      if (stalls >= 3) throw new Error(`3 consecutive iterations made no progress; stuck story ${open[0].id}`);
    }
    throw new Error(`Ralph reached max iterations (${maxIterations}) with stories still open`);
  } finally {
    await rm(pidFile, { force: true });
    await rm(lockDir, { recursive: true, force: true });
    await rm(iterationPidFile, { force: true });
  }
}

main().catch(async (error) => {
  await writeFile(stateFile, "FAILED\n");
  await log(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
