#!/usr/bin/env node
/**
 * Post-deploy script for Firebase Functions
 * 
 * Restores workspace:* references after deployment
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const functionsPkgJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
const functionsPkgJson = JSON.parse(fs.readFileSync(functionsPkgJsonPath, 'utf8'));

const WORKSPACE_PACKAGES = [
  'shared-firebase-types',
  'shared-firebase-models',
  'shared-backbone-intelligence'
];

let modified = false;
for (const pkgName of WORKSPACE_PACKAGES) {
  if (functionsPkgJson.dependencies && functionsPkgJson.dependencies[pkgName]?.startsWith('file:./node_modules/')) {
    functionsPkgJson.dependencies[pkgName] = 'workspace:*';
    modified = true;
  }
}

if (modified) {
  fs.writeFileSync(functionsPkgJsonPath, JSON.stringify(functionsPkgJson, null, 2) + '\n');
  console.log('✅ Restored workspace:* references');
}
