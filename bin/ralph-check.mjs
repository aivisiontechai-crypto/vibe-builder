#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';

const checks = [];
const failed = [];

function addCheck(label, fn) {
  checks.push({ label, fn });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'pipe',
    shell: false,
    timeout: options.timeout ?? 20000,
    windowsHide: true,
    ...options,
  });
}

function ok(label) {
  console.log(`OK   ${label}`);
}

function fail(label, reason) {
  console.log(`FAIL ${label}${reason ? `: ${reason}` : ''}`);
  failed.push(label);
}

function hasBinary(name) {
  const probe = run(process.platform === 'win32' ? 'where' : 'which', [name], { timeout: 10000 });
  return probe.status === 0;
}

addCheck('Node.js', () => {
  const out = run('node', ['--version'], { timeout: 10000 });
  if (out.status === 0) {
    ok(`Node.js ${out.stdout.toString().trim()}`);
    return;
  }
  fail('Node.js', 'node is not available on PATH');
});

addCheck('Git', () => {
  const out = run('git', ['--version'], { timeout: 10000 });
  if (out.status === 0) {
    ok(`Git ${out.stdout.toString().trim().split(' ').slice(-1)[0]}`);
    return;
  }
  fail('Git', 'git is not available on PATH');
});

addCheck('npx', () => {
  if (hasBinary('npx')) {
    ok('npx');
    return;
  }
  fail('npx', 'npx is required for skill and project dependency installation');
});

addCheck('jq', () => {
  if (hasBinary('jq')) {
    ok('jq');
    return;
  }
  fail('jq', 'jq is required for JSON handling and legacy POSIX scripts');
});

addCheck('Docker', () => {
  if (!hasBinary('docker')) {
    fail('Docker', 'docker is not available on PATH');
    return;
  }

  const out = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 20000 });
  if (out.status === 0) {
    const version = out.stdout.toString().trim();
    ok(`Docker ${version || 'daemon reachable'}`);
    return;
  }

  fail('Docker', 'docker is installed but the daemon is not reachable');
});

addCheck('AI backend', () => {
  const candidates = [
    {
      name: 'opencode',
      probe: ['run', '--auto', 'reply ok'],
    },
    {
      name: 'claude',
      probe: ['-p', 'reply ok', '--dangerously-skip-permissions'],
    },
    {
      name: 'codex',
      probe: ['exec', 'reply ok'],
    },
  ];

  const available = candidates.find(({ name }) => hasBinary(name));
  if (!available) {
    fail('AI backend', 'need one of: opencode, claude, codex');
    return;
  }

  const result = run(available.name, available.probe, { timeout: 30000 });
  if (result.status === 0) {
    ok(`AI backend ${available.name}`);
    return;
  }

  fail('AI backend', `${available.name} is installed but did not pass a trivial smoke test`);
});

addCheck('Disk space', () => {
  let bytes;
  try {
    const stats = statfsSync(process.cwd());
    bytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    fail('Disk space', 'could not determine available disk space');
    return;
  }
  if (!Number.isFinite(bytes) || bytes < 2 * 1024 ** 3) {
    fail('Disk space', 'less than 2 GB is available on the workspace volume');
    return;
  }
  ok(`Disk space ${(bytes / 1024 ** 3).toFixed(1)} GB free`);
});

for (const check of checks) {
  check.fn();
}

if (failed.length > 0) {
  console.log('');
  console.log('Preflight failed. Fix the items above before starting a hands-free build.');
  process.exit(1);
}

console.log('');
console.log('Preflight passed. The builder can start in hands-free mode.');
