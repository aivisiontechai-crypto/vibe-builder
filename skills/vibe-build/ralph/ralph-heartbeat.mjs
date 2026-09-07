#!/usr/bin/env node
// ralph-heartbeat.mjs — cross-platform (incl. Windows) external watchdog
// for ralph-runner.mjs. Mirrors ralph-heartbeat.sh's job for the Bash
// driver: ralph-runner.mjs already self-heals a HUNG iteration in-process
// (see its idleTtlMs watchdog), but nothing external relaunches it if the
// runner process itself dies (crash, OOM-kill, unhandled rejection outside
// the try/finally). This script is that missing external supervisor.
// Usage: node ralph-heartbeat.mjs   (env: RALPH_HEARTBEAT_POLL_MS,
//                                     RALPH_HEARTBEAT_MAX_RELAUNCH)
import { readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const prdFile = path.join(projectRoot, "prd.json");
const runnerFile = path.join(scriptDir, "ralph-runner.mjs");
const pidFile = path.join(scriptDir, ".ralph.pid");
const stateFile = path.join(scriptDir, "heartbeat.state");
const haltFile = path.join(scriptDir, ".halt");
const logFile = path.join(scriptDir, "ralph.log");

const pollMs = Number(process.env.RALPH_HEARTBEAT_POLL_MS ?? 30_000);
const maxRelaunch = Number(process.env.RALPH_HEARTBEAT_MAX_RELAUNCH ?? 6);
const relaunchGraceMs = 90_000;

const logState = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  appendFileSync(stateFile, `${line}\n`);
  process.stdout.write(`${line}\n`);
};

function isProcessAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  if (process.platform === "win32") {
    return spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { stdio: "pipe", windowsHide: true }).stdout?.toString().includes(String(pid)) ?? false;
  }
  // EPERM means the pid exists but is owned by another user (still alive);
  // only ESRCH (no such process) means the pid is stale.
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

async function openStoryCount() {
  try {
    const prd = JSON.parse(await readFile(prdFile, "utf8"));
    return prd.userStories.filter((story) => story.passes === false).length;
  } catch {
    return null; // unreadable
  }
}

function relaunchRunner(maxIterationsMargin) {
  const child = spawn(process.execPath, [runnerFile, String(maxIterationsMargin)], {
    cwd: projectRoot,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => appendFileSync(logFile, chunk.toString()));
  child.stderr.on("data", (chunk) => appendFileSync(logFile, chunk.toString()));
  child.unref();
}

async function main() {
  logState(`heartbeat started poll=${pollMs}ms max_relaunch=${maxRelaunch}`);
  let lastRelaunchAt = 0;
  let relaunches = 0;

  for (;;) {
    const open = await openStoryCount();
    if (open === null) {
      logState("FAILED prd.json unreadable");
      process.exitCode = 1;
      return;
    }
    if (existsSync(haltFile)) {
      logState(`HALT requested (${open} stories open) — stopping and not relaunching`);
      await rm(haltFile, { force: true });
      return;
    }
    if (open === 0) {
      const state = existsSync(stateFile) ? readFileSync(stateFile, "utf8").trim().split(/\r?\n/).pop() : "";
      if (state === "DONE") {
        logState("DONE all stories pass and completion gate passed");
        return;
      }
      if (state === "FAILED") {
        logState("FAILED completion gate or runner failed after stories passed");
        process.exitCode = 1;
        return;
      }
      logState("WAITING all stories pass but runner has not completed its final gate");
    }

    const existingPid = existsSync(pidFile) ? Number((readFileSync(pidFile, "utf8") || "").trim()) : 0;
    if (isProcessAlive(existingPid)) {
      logState(`RUNNING runner pid ${existingPid} alive (${open} open)`);
    } else {
      const now = Date.now();
      if (now - lastRelaunchAt < relaunchGraceMs) {
        logState("RECHECK runner reappearing (relaunch grace window)");
      } else if (relaunches >= maxRelaunch) {
        logState(`FAILED relaunch cap (${maxRelaunch}) hit with ${open} stories open`);
        process.exitCode = 1;
        return;
      } else {
        relaunches += 1;
        lastRelaunchAt = now;
        const margin = open + 5;
        logState(`DEAD runner gone, ${open} stories open — relaunch attempt ${relaunches} (max ${margin})`);
        relaunchRunner(margin);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main();
