#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceRoot = path.resolve(__dirname, '../skills/vibe-build/ralph');
const defaultTargetRoot = path.join(os.homedir(), '.agents', 'ralph', 'scripts', 'ralph');

const driverFiles = [
  'ralph-driver.sh',
  'ralph-iteration.sh',
  'ralph-heartbeat.sh',
  'ralph-heartbeat.mjs',
  'ralph-runner.mjs',
  'ralph-runner-parallel.mjs',
  'RALPH.md',
];

function printUsage() {
  console.log('Usage: node ralph-setup.mjs [--target <path>] [--dry-run]');
  console.log('');
  console.log('Default target: ~/.agents/ralph/scripts/ralph');
  console.log('This is the cross-platform installer for the bundled ralph driver.');
}

let targetRoot = defaultTargetRoot;
let dryRun = false;

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];

  if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  }

  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }

  if (arg === '--target') {
    const next = process.argv[i + 1];
    if (!next || next.startsWith('-')) {
      console.error('Missing value for --target');
      printUsage();
      process.exit(1);
    }
    targetRoot = path.resolve(next);
    i += 1;
    continue;
  }

  if (arg.startsWith('--target=')) {
    targetRoot = path.resolve(arg.split('=')[1]);
    continue;
  }

  if (!arg.startsWith('-')) {
    targetRoot = path.resolve(arg);
    continue;
  }

  console.error(`Unknown argument: ${arg}`);
  printUsage();
  process.exit(1);
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`Bundled ralph driver not found at ${sourceRoot}`);
  process.exit(1);
}

const missingFiles = driverFiles.filter((file) => !fs.existsSync(path.join(sourceRoot, file)));
if (missingFiles.length > 0) {
  console.error(`Missing bundled ralph files: ${missingFiles.join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(targetRoot, { recursive: true });

for (const file of driverFiles) {
  const sourceFile = path.join(sourceRoot, file);
  const targetFile = path.join(targetRoot, file);

  if (dryRun) {
    console.log(`DRY RUN: would copy ${file} -> ${targetFile}`);
    continue;
  }

  fs.copyFileSync(sourceFile, targetFile);
  console.log(`Installed ${file} -> ${targetFile}`);

  if (/\.(sh|mjs)$/i.test(file)) {
    fs.chmodSync(targetFile, 0o755);
  }
}

console.log('');
console.log(`Done. Driver installed to: ${targetRoot}`);
console.log('The next project built will reuse this machine-wide copy.');
