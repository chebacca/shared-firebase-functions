#!/usr/bin/env node
/**
 * Pre-deploy script for Firebase Functions
 * 
 * This script bundles workspace dependencies into _workspace_libs before deployment
 * since Cloud Build doesn't support pnpm workspace protocol.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const LOCAL_LIBS_DIR = path.join(FUNCTIONS_DIR, '_workspace_libs');

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

console.log(`\n📦 Copying workspace packages to _workspace_libs (excluding node_modules)...\n`);

// Ensure local libs dir exists
if (!fs.existsSync(LOCAL_LIBS_DIR)) {
  fs.mkdirSync(LOCAL_LIBS_DIR, { recursive: true });
}

// Copy each workspace package
for (const pkgName of WORKSPACE_PACKAGES) {
  const sourceDir = path.join(ROOT_DIR, pkgName);
  if (!fs.existsSync(sourceDir)) {
    console.warn(`⚠️  Warning: ${pkgName} not found at ${sourceDir}`);
    continue;
  }

  const pkgJsonPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.warn(`⚠️  Warning: package.json not found for ${pkgName}`);
    continue;
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const actualPkgName = pkgJson.name || pkgName;
  const targetDir = path.join(LOCAL_LIBS_DIR, actualPkgName);

  // Remove existing if present
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // Create directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Use rsync to copy, EXCLUDING node_modules and .git
  console.log(`Copying ${actualPkgName}...`);
  try {
    execSync(`rsync -a --exclude 'node_modules' --exclude '.git' --exclude 'src' "${sourceDir}/" "${targetDir}/"`, { stdio: 'inherit' });
    console.log(`✅ Bundled ${actualPkgName}`);
  } catch (error) {
    console.error(`❌ Error bundling ${actualPkgName}:`, error.message);
  }
}

// Update package.json to use file: references instead of workspace:*
const functionsPkgJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
const functionsPkgJsonBackup = path.join(FUNCTIONS_DIR, 'package.json.backup');

// Create backup of package.json before modifying
if (fs.existsSync(functionsPkgJsonPath) && !fs.existsSync(functionsPkgJsonBackup)) {
  console.log('📋 Creating backup of package.json...');
  fs.copyFileSync(functionsPkgJsonPath, functionsPkgJsonBackup);
  console.log('✅ Backup created\n');
}

const functionsPkgJson = JSON.parse(fs.readFileSync(functionsPkgJsonPath, 'utf8'));

let modified = false;
for (const pkgName of WORKSPACE_PACKAGES) {
  if (functionsPkgJson.dependencies && functionsPkgJson.dependencies[pkgName] === 'workspace:*') {
    functionsPkgJson.dependencies[pkgName] = `file:./_workspace_libs/${pkgName}`;
    modified = true;
  }
}

// Replace catalog: references in bundled packages with actual versions
console.log('\n🔧 Replacing catalog: references with actual versions...\n');
for (const pkgName of WORKSPACE_PACKAGES) {
  const targetPkgJsonPath = path.join(LOCAL_LIBS_DIR, pkgName, 'package.json');
  if (!fs.existsSync(targetPkgJsonPath)) {
    continue;
  }

  const targetPkgJson = JSON.parse(fs.readFileSync(targetPkgJsonPath, 'utf8'));
  let pkgModified = false;

  // Read catalog versions from pnpm-workspace.yaml
  const workspaceYamlPath = path.join(ROOT_DIR, 'pnpm-workspace.yaml');
  let versionMap = {};
  if (fs.existsSync(workspaceYamlPath)) {
    const workspaceYaml = fs.readFileSync(workspaceYamlPath, 'utf8');
    // Parse YAML-like structure to extract catalog versions
    const catalogMatch = workspaceYaml.match(/catalogs:\s*\n\s*default:\s*\n([\s\S]*?)(?=\n\w|\n$)/);
    if (catalogMatch) {
      const catalogSection = catalogMatch[1];
      const versionMatches = catalogSection.matchAll(/(\S+):\s*(\S+)/g);
      for (const match of versionMatches) {
        const depName = match[1].trim();
        const version = match[2].trim();
        versionMap[depName] = version;
      }
    }
  }
  
  // Fallback to hardcoded versions if catalog parsing fails
  if (Object.keys(versionMap).length === 0) {
    versionMap = {
      'firebase-admin': '^13.5.0',
      'firebase-functions': '^5.1.1',
      'typescript': '^5.3.3'
    };
  }

  // Replace catalog: references in dependencies
  if (targetPkgJson.dependencies) {
    for (const [dep, version] of Object.entries(targetPkgJson.dependencies)) {
      if (typeof version === 'string' && version.startsWith('catalog:') && versionMap[dep]) {
        targetPkgJson.dependencies[dep] = versionMap[dep];
        pkgModified = true;
        console.log(`  Replaced ${pkgName}/${dep}: ${version} -> ${versionMap[dep]}`);
      }
    }
  }

  // Replace catalog: references in devDependencies
  if (targetPkgJson.devDependencies) {
    for (const [dep, version] of Object.entries(targetPkgJson.devDependencies)) {
      if (typeof version === 'string' && version.startsWith('catalog:') && versionMap[dep]) {
        targetPkgJson.devDependencies[dep] = versionMap[dep];
        pkgModified = true;
        console.log(`  Replaced ${pkgName}/${dep}: ${version} -> ${versionMap[dep]}`);
      }
    }
  }

  if (pkgModified) {
    fs.writeFileSync(targetPkgJsonPath, JSON.stringify(targetPkgJson, null, 2) + '\n');
  }
}

// Replace workspace:* references in bundled packages with file: references
console.log('\n🔧 Replacing workspace:* references with file: references...\n');
for (const pkgName of WORKSPACE_PACKAGES) {
  const targetPkgJsonPath = path.join(LOCAL_LIBS_DIR, pkgName, 'package.json');
  if (!fs.existsSync(targetPkgJsonPath)) {
    continue;
  }

  const targetPkgJson = JSON.parse(fs.readFileSync(targetPkgJsonPath, 'utf8'));
  let pkgModified = false;

  // Replace workspace:* references in dependencies
  if (targetPkgJson.dependencies) {
    for (const [dep, version] of Object.entries(targetPkgJson.dependencies)) {
      if (typeof version === 'string' && version === 'workspace:*') {
        // Check if this dependency is one of our bundled packages
        if (WORKSPACE_PACKAGES.includes(dep)) {
          targetPkgJson.dependencies[dep] = `file:../${dep}`;
          pkgModified = true;
          console.log(`  Replaced ${pkgName}/${dep}: workspace:* -> file:../${dep}`);
        }
      }
    }
  }

  if (pkgModified) {
    fs.writeFileSync(targetPkgJsonPath, JSON.stringify(targetPkgJson, null, 2) + '\n');
  }
}

// Write modified package.json if changes were made
if (modified) {
  fs.writeFileSync(functionsPkgJsonPath, JSON.stringify(functionsPkgJson, null, 2) + '\n');
  console.log('✅ Updated package.json with file: references\n');
}

console.log('\n✨ Pre-deploy bundling complete!\n');
