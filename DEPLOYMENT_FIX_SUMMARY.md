# Firebase Functions Deployment Fix Summary

## Issues Fixed

### 1. ✅ Package.json Dependency References
**Problem:** `package.json` was using `file:./_workspace_libs/` references instead of `workspace:*`

**Fix:** Updated `package.json` to use `workspace:*` for all shared packages:
- `shared-backbone-intelligence`: `workspace:*`
- `shared-firebase-models`: `workspace:*`
- `shared-firebase-types`: `workspace:*`

**Why:** This follows the monorepo's pnpm workspace protocol. The pre-deploy script converts these to `file:` references during deployment.

### 2. ✅ Pre-Deploy Script Backup
**Problem:** Pre-deploy script was modifying `package.json` without creating a backup, causing post-deploy script to fail

**Fix:** Added backup creation before modifying `package.json`:
- Creates `package.json.backup` before any modifications
- Post-deploy script can now properly restore the original file

### 3. ✅ Catalog Version Resolution
**Problem:** Pre-deploy script had hardcoded catalog versions

**Fix:** Updated script to read catalog versions from `pnpm-workspace.yaml`:
- Dynamically parses catalog section
- Falls back to hardcoded versions if parsing fails
- More maintainable and stays in sync with workspace catalog

## Current Configuration

### Firebase Project
- **Project ID:** `backbone-logic`
- **Runtime:** `nodejs20`
- **Source:** `shared-firebase-functions`
- **Entry Point:** `lib/index.js`

### Deployment Process

1. **Pre-deploy** (`scripts/pre-deploy.js`):
   - Builds workspace packages (shared-firebase-types, shared-firebase-models, shared-backbone-intelligence)
   - Copies packages to `_workspace_libs/` (excluding node_modules, .git, src)
   - Creates backup of `package.json`
   - Converts `workspace:*` → `file:./_workspace_libs/`
   - Replaces `catalog:` references with actual versions in bundled packages
   - Runs `pnpm install --no-frozen-lockfile` to install dependencies

2. **Build** (`pnpm run build`):
   - Compiles TypeScript to JavaScript in `lib/` directory
   - Copies report templates

3. **Deploy** (`firebase deploy --only functions`):
   - Deploys from `shared-firebase-functions` directory
   - Uses compiled code in `lib/` directory

4. **Post-deploy** (`scripts/post-deploy.js`):
   - Restores `package.json` from backup
   - Removes backup file
   - Ensures workspace references are restored

## Verification Checklist

- ✅ Firebase CLI authenticated
- ✅ Project set to `backbone-logic`
- ✅ `firebase.json` correctly configured
- ✅ `.firebaserc` matches root configuration
- ✅ `package.json` uses `workspace:*` references
- ✅ Pre-deploy script creates backup
- ✅ Post-deploy script restores backup
- ✅ `lib/index.js` exists (functions built)

## Deployment Command

From project root:
```bash
./scripts/deployment/deploy-functions.sh
```

Or from `shared-firebase-functions` directory:
```bash
firebase deploy --only functions
```

## Troubleshooting

### If deployment fails with dependency errors:
1. Ensure workspace packages are built: `pnpm run build` in each shared package
2. Check that `_workspace_libs/` directory exists after pre-deploy
3. Verify `package.json.backup` exists (should be created by pre-deploy)

### If package.json is corrupted:
1. Restore from backup: `cp package.json.backup package.json`
2. Or restore manually: Change `file:./_workspace_libs/` back to `workspace:*`

### If catalog versions are wrong:
1. Check `pnpm-workspace.yaml` catalog section
2. Update version map in pre-deploy script if needed

## Next Steps

1. Test deployment with a single function first:
   ```bash
   firebase deploy --only functions:healthCheck
   ```

2. If successful, deploy all functions:
   ```bash
   firebase deploy --only functions
   ```

3. Monitor deployment logs for any errors
