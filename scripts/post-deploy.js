#!/usr/bin/env node
/**
 * Post-deploy script for Firebase Functions
 * 
 * Restores package.json from backup created by pre-deploy script.
 * This ensures package.json is always restored even if deployment fails.
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const PKG_JSON_PATH = path.join(FUNCTIONS_DIR, 'package.json');
const PKG_JSON_BACKUP = path.join(FUNCTIONS_DIR, 'package.json.backup');
const ENV_BACKUP = path.join(FUNCTIONS_DIR, '.env.backup.deploy');

// Restore .env if it was stripped of GOOGLE_MAPS_API_KEY during pre-deploy
if (fs.existsSync(ENV_BACKUP)) {
  try {
    fs.copyFileSync(ENV_BACKUP, path.join(FUNCTIONS_DIR, '.env'));
    fs.unlinkSync(ENV_BACKUP);
    console.log('✅ Restored .env (GOOGLE_MAPS_API_KEY)');
  } catch (err) {
    console.warn('⚠️  Could not restore .env from .env.backup.deploy:', err.message);
  }
}

// Always restore package.json from backup if backup exists
if (fs.existsSync(PKG_JSON_BACKUP)) {
  console.log('🔄 Restoring package.json from backup...');

  try {
    // Restore from backup
    fs.copyFileSync(PKG_JSON_BACKUP, PKG_JSON_PATH);

    // Remove backup file
    fs.unlinkSync(PKG_JSON_BACKUP);

    console.log('✅ Restored workspace:* references in package.json');
  } catch (error) {
    console.error(`❌ Error restoring package.json: ${error.message}`);
    console.error('⚠️  Please manually restore package.json from package.json.backup');
    process.exit(1);
  }
} else {
  // If no backup exists, try to restore workspace:* references anyway (legacy support)
  const functionsPkgJson = JSON.parse(fs.readFileSync(PKG_JSON_PATH, 'utf8'));
  const WORKSPACE_PACKAGES = [
    'shared-firebase-types',
    'shared-firebase-models',
    'shared-backbone-intelligence'
  ];

  let modified = false;
  for (const pkgName of WORKSPACE_PACKAGES) {
    if (functionsPkgJson.dependencies &&
      (functionsPkgJson.dependencies[pkgName]?.startsWith('file:./node_modules/') ||
        functionsPkgJson.dependencies[pkgName]?.startsWith('file:./_workspace_libs/'))) {
      functionsPkgJson.dependencies[pkgName] = 'workspace:*';
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(PKG_JSON_PATH, JSON.stringify(functionsPkgJson, null, 2) + '\n');
    console.log('✅ Restored workspace:* references');
  }
}

console.log('✨ Post-deploy cleanup complete!');
