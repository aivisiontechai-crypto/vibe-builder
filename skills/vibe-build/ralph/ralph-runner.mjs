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
const stateFile = path.join(scriptDir, "heartbeat.state");
const haltFile = path.join(scriptDir, ".halt");
const maxLogBytes = Number(process.env.RALPH_MAX_LOG_BYTES ?? 2_000_000);
const retainLogBytes = Number(process.env.RALPH_RETAIN_LOG_BYTES ?? 1_500_000);
const maxIterations = Number(process.argv[2] ?? 200);
const timeoutMs = Number(process.env.RALPH_ITERATION_TIMEOUT_MS ?? 2_700_000);

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
  try { process.kill(pid, 0); return true; } catch { return false; }
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
  const recorded = recordedName && spawnSync(process.platform === "win32" ? "where" : "which", [recordedName], { stdio: "ignore" }).status === 0 ? recordedName : "";
  if (recorded) return recorded;
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
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  await writeFile(iterationPidFile, String(child.pid));
  const stream = (chunk) => appendFile(logFile, chunk.toString());
  child.stdout.on("data", stream);
  child.stderr.on("data", stream);
  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      await log(`iteration pid ${child.pid} exceeded ${timeoutMs}ms; terminating`);
      await stopProcess(child);
    }, timeoutMs);
    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      await rm(iterationPidFile, { force: true });
      resolve({ code, signal });
    });
    child.on("error", async (error) => {
      clearTimeout(timer);
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
  await writeFile(backendFile, `${backend}\n`);
  const prompt = await readFile(promptFile, "utf8");
  // single-instance lock: refuse a second runner against the same project so
  // two loops can't both flip stories and corrupt prd.json. A stale pid file
  // (dead process) is reclaimed; a live pid means an active loop.
  const existingPid = existsSync(pidFile) ? Number((readFileSync(pidFile, "utf8") || "").trim()) : 0;
  if (isProcessAlive(existingPid)) {
    throw new Error(`another ralph runner is already running for ${projectRoot} (pid ${existingPid}) — refusing to start a second loop`);
  }
  await writeFile(pidFile, `${process.pid}\n`);
  await writeFile(stateFile, "RUNNING\n");
  await log(`Starting cross-platform ralph runner (${backend}) — max ${maxIterations} iterations — project: ${projectRoot}`);
  try {
    let previousOpen = Number.POSITIVE_INFINITY;
    let stalls = 0;
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      // clean stop: a supervisor drops scripts/ralph/.halt to stop the loop
      if (existsSync(haltFile)) {
        await log(`Ralph halted by ${haltFile} at iteration ${iteration}.`);
        process.exitCode = 1;
        return;
      }
      const before = storySnapshot(await readPrd());
      await log(`----- iteration ${iteration}/${maxIterations} (${backend}) -----`);
      await runIteration(backend, prompt);
      await boundLog();
      const afterPrd = await readPrd();
      const after = storySnapshot(afterPrd);
      const open = openStories(afterPrd);
      const afterById = new Map(after.map((story) => [story.id, story.passes]));
      const falseToTrue = before.filter((story) => story.passes === false && afterById.get(story.id) === true).length;
      const trueToFalse = before.filter((story) => story.passes === true && afterById.get(story.id) === false).length;
      const changed = before.length === after.length && before.every((story) => afterById.has(story.id)) && falseToTrue === 1 && trueToFalse === 0;
      if (!changed && open.length > 0) await log("iteration made no valid story transition");
      if (open.length === 0) {
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
    await rm(iterationPidFile, { force: true });
  }
}

main().catch(async (error) => {
  await writeFile(stateFile, "FAILED\n");
  await log(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
