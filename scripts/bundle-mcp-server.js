#!/usr/bin/env node
/**
 * Bundle `_backbone_mcp_server` into `shared-firebase-functions` for deployment/runtime.
 *
 * Why:
 * - Cloud Functions runtime can't rely on pnpm workspace links.
 * - The agent tool registry spawns the MCP server process (node dist/index.js).
 * - The MCP server is ESM (`type: "module"`), so we must also copy its package.json
 *   to preserve module resolution semantics.
 *
 * What this does:
 * - Ensures `_backbone_mcp_server` is built (tsc -> dist/)
 * - Copies:
 *   - `_backbone_mcp_server/dist/**`
 *   - `_backbone_mcp_server/package.json`
 *   into:
 *   - `shared-firebase-functions/_backbone_mcp_server/` (cwd-based resolution)
 *   - `shared-firebase-functions/lib/_backbone_mcp_server/` (lib-relative resolution) if `lib/` exists
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const MCP_SOURCE_DIR = path.join(ROOT_DIR, '_backbone_mcp_server');
const MCP_DIST_DIR = path.join(MCP_SOURCE_DIR, 'dist');
const MCP_PKG_JSON = path.join(MCP_SOURCE_DIR, 'package.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  execSync(`rsync -a "${src}/" "${dest}/"`, { stdio: 'inherit' });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

console.log('\n🧩 Bundling Backbone MCP server for functions...\n');

if (!fs.existsSync(MCP_SOURCE_DIR)) {
  console.warn(`⚠️  MCP source not found at ${MCP_SOURCE_DIR}. Skipping MCP bundle.`);
  process.exit(0);
}

// Ensure dist exists (build if needed)
if (!fs.existsSync(MCP_DIST_DIR) || !fs.existsSync(path.join(MCP_DIST_DIR, 'index.js'))) {
  console.log('🔨 Building _backbone_mcp_server...\n');
  try {
    execSync(`cd "${MCP_SOURCE_DIR}" && pnpm run build`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️  Failed to build _backbone_mcp_server. MCP tools may be unavailable at runtime.');
  }
}

if (!fs.existsSync(MCP_DIST_DIR) || !fs.existsSync(path.join(MCP_DIST_DIR, 'index.js'))) {
  console.warn('⚠️  MCP dist/index.js still missing after build. Skipping MCP bundle.');
  process.exit(0);
}

if (!fs.existsSync(MCP_PKG_JSON)) {
  console.warn('⚠️  MCP package.json missing. Skipping MCP bundle.');
  process.exit(0);
}

const targets = [
  path.join(FUNCTIONS_DIR, '_backbone_mcp_server'),
  path.join(FUNCTIONS_DIR, 'lib', '_backbone_mcp_server')
].filter((p) => p.includes('/lib/') ? fs.existsSync(path.join(FUNCTIONS_DIR, 'lib')) : true);

for (const targetBase of targets) {
  console.log(`📦 Copying MCP server into: ${targetBase}`);
  ensureDir(targetBase);
  copyDir(MCP_DIST_DIR, path.join(targetBase, 'dist'));
  copyFile(MCP_PKG_JSON, path.join(targetBase, 'package.json'));
}

console.log('\n✅ MCP server bundling complete.\n');

