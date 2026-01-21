#!/usr/bin/env node
/**
 * Pre-deploy script for Firebase Functions
 * 
 * This script bundles workspace dependencies into node_modules before deployment
 * since Cloud Build doesn't support pnpm workspace protocol.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const NODE_MODULES_DIR = path.join(FUNCTIONS_DIR, 'node_modules');

// Workspace packages to bundle
const WORKSPACE_PACKAGES = [
  'shared-firebase-types',
  'shared-firebase-models',
  'shared-backbone-intelligence'
];

console.log('📦 Bundling workspace dependencies for Firebase deployment...\n');

// Build workspace packages first
console.log('🔨 Building workspace packages...\n');
for (const pkgName of WORKSPACE_PACKAGES) {
  const sourceDir = path.join(ROOT_DIR, pkgName);
  if (!fs.existsSync(sourceDir)) {
    continue;
  }
  
  const pkgJsonPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    continue;
  }
  
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  if (pkgJson.scripts && pkgJson.scripts.build) {
    console.log(`Building ${pkgName}...`);
    try {
      execSync(`cd "${sourceDir}" && pnpm run build`, { stdio: 'inherit' });
    } catch (error) {
      console.warn(`⚠️  Warning: Failed to build ${pkgName}, continuing...`);
    }
  }
}

console.log('\n📦 Copying workspace packages to node_modules...\n');

// Ensure node_modules exists
if (!fs.existsSync(NODE_MODULES_DIR)) {
  fs.mkdirSync(NODE_MODULES_DIR, { recursive: true });
}

// Copy each workspace package
for (const pkgName of WORKSPACE_PACKAGES) {
  const sourceDir = path.join(ROOT_DIR, pkgName);
  const targetDir = path.join(NODE_MODULES_DIR, pkgName);
  
  if (!fs.existsSync(sourceDir)) {
    console.warn(`⚠️  Warning: ${pkgName} not found at ${sourceDir}`);
    continue;
  }
  
  // Read package.json to get the actual package name
  const pkgJsonPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.warn(`⚠️  Warning: package.json not found for ${pkgName}`);
    continue;
  }
  
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const actualPkgName = pkgJson.name || pkgName;
  const finalTargetDir = path.join(NODE_MODULES_DIR, actualPkgName);
  
  // Remove existing if present
  if (fs.existsSync(finalTargetDir)) {
    fs.rmSync(finalTargetDir, { recursive: true, force: true });
  }
  
  // Create directory
  fs.mkdirSync(finalTargetDir, { recursive: true });
  
  // Copy package.json
  fs.copyFileSync(pkgJsonPath, path.join(finalTargetDir, 'package.json'));
  
  // Copy lib directory if it exists
  const libDir = path.join(sourceDir, 'lib');
  if (fs.existsSync(libDir)) {
    execSync(`cp -r "${libDir}" "${finalTargetDir}/"`, { stdio: 'inherit' });
  }
  
  // Copy dist directory if it exists (for shared-backbone-intelligence)
  const distDir = path.join(sourceDir, 'dist');
  if (fs.existsSync(distDir)) {
    execSync(`cp -r "${distDir}" "${finalTargetDir}/"`, { stdio: 'inherit' });
  }
  
  // Copy src directory if lib/dist doesn't exist (for development)
  if (!fs.existsSync(libDir) && !fs.existsSync(distDir)) {
    const srcDir = path.join(sourceDir, 'src');
    if (fs.existsSync(srcDir)) {
      execSync(`cp -r "${srcDir}" "${finalTargetDir}/"`, { stdio: 'inherit' });
    }
  }
  
  // Copy README if exists
  const readmePath = path.join(sourceDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, path.join(finalTargetDir, 'README.md'));
  }
  
  console.log(`✅ Bundled ${actualPkgName}`);
}

// Update package.json to use file: references instead of workspace:*
const functionsPkgJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
const functionsPkgJson = JSON.parse(fs.readFileSync(functionsPkgJsonPath, 'utf8'));

let modified = false;
for (const pkgName of WORKSPACE_PACKAGES) {
  if (functionsPkgJson.dependencies && functionsPkgJson.dependencies[pkgName] === 'workspace:*') {
    functionsPkgJson.dependencies[pkgName] = `file:./node_modules/${pkgName}`;
    modified = true;
  }
}

if (modified) {
  fs.writeFileSync(functionsPkgJsonPath, JSON.stringify(functionsPkgJson, null, 2) + '\n');
  console.log('\n✅ Updated package.json to use file: references');
}

console.log('\n✨ Pre-deploy bundling complete!\n');
