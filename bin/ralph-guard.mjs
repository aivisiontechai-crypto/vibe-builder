#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignoreDirs = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage', 'test-results', '.turbo', '.cache', 'docker-data', 'playwright-report']);
const ignoredFiles = new Set(['.DS_Store']);
const appRoots = ['src', 'app', 'pages', 'components', 'lib', 'docs', 'public', 'scripts', 'prisma', 'apps', 'packages'];
const fileExts = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.md', '.json', '.css', '.scss', '.env', '.sh', '.bash', '.ps1']);
const patterns = [
  /jsonplaceholder/i,
  /lorem\s+ipsum/i,
  /TODO|FIXME|TBD|CHANGEME|REPLACE_ME|INSERT_SECRET|your_app/i,
  /https?:\/\/(?:www\.)?example\.com(?:[/'\s)]|$)/i,
  /<\s*app\s*>/i,
];

const issues = [];
const selectedRoots = appRoots.filter((dir) => fs.existsSync(path.join(root, dir)));

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.env.example') continue;

    const abs = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(abs);
      continue;
    }

    if (entry.isFile()) {
      if (ignoredFiles.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!fileExts.has(ext)) continue;

      if (entry.name === 'README.md' || entry.name === 'SKILL.md' || entry.name === 'LEDGER.md' || entry.name === 'CLAUDE.md' || entry.name === 'AGENTS.md') {
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          issues.push(abs);
          break;
        }
      }
    }
  }
}

function printBanner() {
  console.log('ralph-guard: scanning generated app source and docs for fake-data markers');
  console.log(`root: ${root}`);
}

printBanner();
for (const rootName of selectedRoots) {
  walk(path.join(root, rootName));
}

if (issues.length > 0) {
  console.log('');
  console.log('Placeholder/fake-data scan failed. Fix the following files before shipping:');
  for (const file of [...new Set(issues)].sort()) {
    console.log(`- ${path.relative(root, file) || file}`);
  }
  process.exit(1);
}

console.log('');
console.log('No placeholder or fake-data markers found in the app source/docs being checked.');
process.exit(0);
