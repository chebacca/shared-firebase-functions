#!/usr/bin/env node
/**
 * Add memory: '512MiB' to Firebase functions that use the zero-options form
 * (onCall(async (...) or onRequest(async (...)) to avoid Cloud Run healthcheck timeouts.
 *
 * Safe: Only replaces the exact strings below. Does not touch:
 * - Functions that already have an options object (they use onCall( { or onCall(\n  {)
 * - defaultCallableOptions usage (onCall(defaultCallableOptions, async)
 * - Running twice is idempotent: after replace, "onCall(async (" no longer appears.
 *
 * Run from repo root:
 *   node shared-firebase-functions/scripts/add-memory-to-functions.cjs
 * Dry run (no writes):
 *   DRY_RUN=1 node shared-firebase-functions/scripts/add-memory-to-functions.cjs
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const DRY_RUN = process.env.DRY_RUN === '1';

const REPLACEMENTS = [
  ["onCall(async (", "onCall({ memory: '512MiB' }, async ("],
  ["onRequest(async (", "onRequest({ memory: '512MiB' }, async ("],
];

function getAllTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== 'node_modules' && ent.name !== 'dist' && !ent.name.startsWith('.')) {
        getAllTsFiles(full, files);
      }
    } else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let total = 0;
  for (const [from, to] of REPLACEMENTS) {
    const count = (content.match(new RegExp(escapeRe(from), 'g')) || []).length;
    if (count > 0) {
      content = content.split(from).join(to);
      total += count;
    }
  }
  return { content, total };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const files = getAllTsFiles(SRC_DIR);
  const modified = [];

  for (const filePath of files) {
    const { content, total } = processFile(filePath);
    if (total > 0) {
      const rel = path.relative(path.join(__dirname, '..'), filePath);
      modified.push({ path: rel, count: total });
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }
  }

  console.log(DRY_RUN ? '[DRY RUN] ' : '');
  console.log(`Scanned ${files.length} .ts files`);
  console.log(`${modified.length} files ${DRY_RUN ? 'would be ' : ''}modified (${modified.reduce((s, m) => s + m.count, 0)} replacements):`);
  modified.forEach(({ path: p, count }) => console.log('  ', p, `(${count})`));
  if (DRY_RUN && modified.length > 0) {
    console.log('\nRun without DRY_RUN=1 to apply.');
  }
}

main();
