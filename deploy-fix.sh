#!/bin/bash
set -e

# Directories
FUNCTIONS_DIR=$(pwd)
ROOT_DIR=$(dirname "$FUNCTIONS_DIR")
MODELS_DIR="$ROOT_DIR/shared-firebase-models"
INTELLIGENCE_DIR="$ROOT_DIR/shared-backbone-intelligence"

echo "📦 Preparing dependencies with fixed package.json files..."

# --- 1. SHARED FIREBASE MODELS ---
cd "$MODELS_DIR"
cp package.json package.json.bak
echo "🔧 Fixing shared-firebase-models package.json..."
node -e "
const fs = require('fs');
const pkg = require('./package.json');
// Replace catalog refs
if (pkg.dependencies && pkg.dependencies['firebase-admin'] === 'catalog:default') pkg.dependencies['firebase-admin'] = '^13.5.0';
if (pkg.dependencies && pkg.dependencies['firebase-functions'] === 'catalog:default') pkg.dependencies['firebase-functions'] = '^5.1.1';
if (pkg.devDependencies && pkg.devDependencies['typescript'] === 'catalog:default') pkg.devDependencies['typescript'] = '^5.3.3';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"
# Pack
MODELS_TGZ=$(npm pack)
mv "$MODELS_TGZ" "$FUNCTIONS_DIR/shared-firebase-models.tgz"
# Restore
mv package.json.bak package.json
echo "✅ Packed shared-firebase-models (fixed)"


# --- 2. SHARED BACKBONE INTELLIGENCE ---
cd "$INTELLIGENCE_DIR"
cp package.json package.json.bak
echo "🔧 Fixing shared-backbone-intelligence package.json..."
node -e "
const fs = require('fs');
const pkg = require('./package.json');
// Replace catalog refs
if (pkg.dependencies && pkg.dependencies['firebase-admin'] === 'catalog:default') pkg.dependencies['firebase-admin'] = '^13.5.0';
if (pkg.devDependencies && pkg.devDependencies['typescript'] === 'catalog:default') pkg.devDependencies['typescript'] = '^5.3.3';

// Replace workspace ref for models - set to * so it accepts whatever is installed by parent
if (pkg.dependencies && pkg.dependencies['shared-firebase-models'] === 'workspace:*') pkg.dependencies['shared-firebase-models'] = '*';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"
# Pack
INTELLIGENCE_TGZ=$(npm pack)
mv "$INTELLIGENCE_TGZ" "$FUNCTIONS_DIR/shared-backbone-intelligence.tgz"
# Restore
mv package.json.bak package.json
echo "✅ Packed shared-backbone-intelligence (fixed)"


# --- 3. FUNCTIONS DEPLOYMENT ---
cd "$FUNCTIONS_DIR"

# Backup package.json
cp package.json package.json.bak
# Remove lockfile to force fresh resolution in cloud
rm -f package-lock.json

echo "🔧 Updating functions package.json..."
node -e "
const fs = require('fs');
const pkg = require('./package.json');

// Update dependencies to use local files
pkg.dependencies['shared-firebase-models'] = 'file:./shared-firebase-models.tgz';
pkg.dependencies['shared-backbone-intelligence'] = 'file:./shared-backbone-intelligence.tgz';

// Ensure other catalog refs are gone (though I did them manually earlier, safety check)
if (pkg.dependencies['firebase-admin'] === 'catalog:default') pkg.dependencies['firebase-admin'] = '^13.5.0';
if (pkg.dependencies['firebase-functions'] === 'catalog:default') pkg.dependencies['firebase-functions'] = '^5.1.1';
if (pkg.dependencies['axios'] === 'catalog:default') pkg.dependencies['axios'] = '^1.6.2';
if (pkg.dependencies['date-fns'] === 'catalog:default') pkg.dependencies['date-fns'] = '^3.6.0';
if (pkg.devDependencies['typescript'] === 'catalog:default') pkg.devDependencies['typescript'] = '^5.3.3';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

echo "🚀 Deploying to Firebase..."
firebase deploy --only functions:executeAIAction || true

# Cleanup
echo "🧹 Cleaning up..."
mv package.json.bak package.json
# We don't restore package-lock.json as it's better to regenerate it locally next time
rm shared-firebase-models.tgz
rm shared-backbone-intelligence.tgz

echo "✨ Deployment attempt finished!"
