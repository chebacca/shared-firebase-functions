#!/usr/bin/env node
/**
 * Verification script for Firebase Functions deployment setup
 * 
 * Checks that all configuration is correct before deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(__dirname, '../..');

let errors = [];
let warnings = [];

console.log('🔍 Verifying Firebase Functions Deployment Setup\n');
console.log('═'.repeat(50) + '\n');

// 1. Check package.json uses workspace:* references
console.log('1️⃣  Checking package.json dependencies...');
const pkgJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
if (fs.existsSync(pkgJsonPath)) {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const deps = pkgJson.dependencies || {};
  
  const workspaceDeps = ['shared-backbone-intelligence', 'shared-firebase-models', 'shared-firebase-types'];
  for (const dep of workspaceDeps) {
    if (deps[dep]) {
      if (deps[dep] === 'workspace:*') {
        console.log(`   ✅ ${dep}: workspace:*`);
      } else if (deps[dep].startsWith('file:./_workspace_libs/')) {
        errors.push(`${dep} is using file: reference instead of workspace:*`);
        console.log(`   ❌ ${dep}: ${deps[dep]} (should be workspace:*)`);
      } else {
        warnings.push(`${dep} has unexpected reference: ${deps[dep]}`);
        console.log(`   ⚠️  ${dep}: ${deps[dep]}`);
      }
    }
  }
} else {
  errors.push('package.json not found');
}

// 2. Check Firebase configuration
console.log('\n2️⃣  Checking Firebase configuration...');
const firebaseJsonPath = path.join(ROOT_DIR, 'firebase.json');
if (fs.existsSync(firebaseJsonPath)) {
  const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
  const functions = firebaseJson.functions || [];
  const functionsConfig = functions.find(f => f.source === 'shared-firebase-functions');
  
  if (functionsConfig) {
    console.log(`   ✅ Functions source: ${functionsConfig.source}`);
    console.log(`   ✅ Runtime: ${functionsConfig.runtime || 'not specified'}`);
  } else {
    errors.push('Functions configuration not found in firebase.json');
  }
} else {
  errors.push('firebase.json not found in project root');
}

// 3. Check .firebaserc
console.log('\n3️⃣  Checking .firebaserc...');
const firebasercPath = path.join(ROOT_DIR, '.firebaserc');
if (fs.existsSync(firebasercPath)) {
  const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
  const defaultProject = firebaserc.projects?.default;
  if (defaultProject) {
    console.log(`   ✅ Default project: ${defaultProject}`);
  } else {
    warnings.push('No default project set in .firebaserc');
  }
} else {
  warnings.push('.firebaserc not found');
}

// 4. Check Firebase CLI authentication
console.log('\n4️⃣  Checking Firebase CLI authentication...');
try {
  execSync('firebase projects:list', { stdio: 'pipe', cwd: ROOT_DIR });
  console.log('   ✅ Firebase CLI authenticated');
} catch (error) {
  errors.push('Firebase CLI not authenticated. Run: firebase login');
  console.log('   ❌ Firebase CLI authentication failed');
}

// 5. Check if lib/index.js exists (functions built)
console.log('\n5️⃣  Checking if functions are built...');
const libIndexPath = path.join(FUNCTIONS_DIR, 'lib', 'index.js');
if (fs.existsSync(libIndexPath)) {
  console.log('   ✅ lib/index.js exists (functions are built)');
} else {
  warnings.push('lib/index.js not found. Run: pnpm run build');
  console.log('   ⚠️  lib/index.js not found (run pnpm run build)');
}

// 6. Check pre-deploy script
console.log('\n6️⃣  Checking pre-deploy script...');
const preDeployPath = path.join(FUNCTIONS_DIR, 'scripts', 'pre-deploy.js');
if (fs.existsSync(preDeployPath)) {
  const preDeployContent = fs.readFileSync(preDeployPath, 'utf8');
  if (preDeployContent.includes('package.json.backup')) {
    console.log('   ✅ Pre-deploy script creates backup');
  } else {
    errors.push('Pre-deploy script does not create backup');
  }
} else {
  errors.push('pre-deploy.js not found');
}

// 7. Check post-deploy script
console.log('\n7️⃣  Checking post-deploy script...');
const postDeployPath = path.join(FUNCTIONS_DIR, 'scripts', 'post-deploy.js');
if (fs.existsSync(postDeployPath)) {
  console.log('   ✅ Post-deploy script exists');
} else {
  errors.push('post-deploy.js not found');
}

// 8. Check workspace packages exist
console.log('\n8️⃣  Checking workspace packages...');
const workspacePackages = ['shared-firebase-types', 'shared-firebase-models', 'shared-backbone-intelligence'];
for (const pkg of workspacePackages) {
  const pkgPath = path.join(ROOT_DIR, pkg);
  if (fs.existsSync(pkgPath)) {
    console.log(`   ✅ ${pkg} exists`);
  } else {
    warnings.push(`${pkg} not found in workspace`);
    console.log(`   ⚠️  ${pkg} not found`);
  }
}

// Summary
console.log('\n' + '═'.repeat(50));
console.log('\n📊 Summary\n');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed! Ready for deployment.\n');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log('❌ Errors found:\n');
    errors.forEach(err => console.log(`   - ${err}`));
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:\n');
    warnings.forEach(warn => console.log(`   - ${warn}`));
    console.log('');
  }
  
  if (errors.length > 0) {
    console.log('❌ Please fix errors before deploying.\n');
    process.exit(1);
  } else {
    console.log('⚠️  Warnings found, but deployment may still work.\n');
    process.exit(0);
  }
}
