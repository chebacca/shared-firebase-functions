# 🔥 Firebase Functions Deployment Status

## ✅ Single Source of Truth Established

All shared Firebase Functions are now centralized in `shared-firebase-functions/` with verification tools and documentation in place.

## Current Status

### ✅ Completed

1. **Old 1st Gen Function Deleted**
   - `dropboxOAuthCallbackHttp` (1st Gen) successfully deleted
   - Ready for 2nd Gen deployment

2. **Verification Tools Created**
   - `scripts/verify-single-source-of-truth.sh` - Automated verification script
   - Checks for duplicate function definitions
   - Validates deployment structure

3. **Documentation Created**
   - `SINGLE_SOURCE_OF_TRUTH.md` - Comprehensive guidelines
   - `MIGRATION_AND_DEPLOYMENT_FIX.md` - Migration process
   - `DEPLOYMENT_STATUS.md` - This file

4. **Configuration Updated**
   - `.npmrc` updated with `legacy-peer-deps=true` for Firebase builds
   - Resolves peer dependency conflicts

### ⚠️ Pending

1. **dropboxOAuthCallbackHttp Deployment**
   - Function code is correct (2nd Gen)
   - Deployment blocked by temporary Google Cloud service identity API issue
   - **Action**: Retry deployment when API is available:
     ```bash
     cd shared-firebase-functions
     firebase deploy --only functions:dropboxOAuthCallbackHttp --project backbone-logic
     ```

## Verification Results

### ✅ No Duplicate Shared Functions Found
- All shared/integration functions are in `shared-firebase-functions/`
- No duplicate `dropboxOAuthCallbackHttp` or other shared functions in other projects
- App-specific server functions (like licensing website API) are separate and acceptable

### ⚠️ False Positives in Verification
- Verification script found type definitions and client-side code references
- These are NOT actual function definitions
- Script can be refined to filter out false positives

## Function Organization

### Shared Functions (shared-firebase-functions/)
- ✅ Dropbox OAuth functions
- ✅ Google Drive OAuth functions
- ✅ Box OAuth functions
- ✅ Slack integration functions
- ✅ Video conferencing functions
- ✅ Workflow system functions
- ✅ Timecard functions
- ✅ All integration functions

### App-Specific Functions (Acceptable)
- ✅ Licensing website API (`_backbone_licensing_website/server/`)
  - This is an Express server, not duplicate Firebase Functions
  - Acceptable as it's app-specific

## Deployment Process

### Standard Deployment
```bash
cd shared-firebase-functions
pnpm run build
./deploy-all.sh
```

### Deploy Specific Function
```bash
cd shared-firebase-functions
firebase deploy --only functions:functionName --project backbone-logic
```

### Verify Before Deployment
```bash
cd shared-firebase-functions
./scripts/verify-single-source-of-truth.sh
```

## Migration Process (For Future)

If you encounter:
```
Error: Upgrading from 1st Gen to 2nd Gen is not yet supported
```

**Solution:**
1. Delete old 1st Gen function:
   ```bash
   firebase functions:delete functionName --region us-central1 --force --project backbone-logic
   ```

2. Redeploy as 2nd Gen:
   ```bash
   firebase deploy --only functions:functionName --project backbone-logic
   ```

## Best Practices

1. ✅ **Always deploy from `shared-firebase-functions/`**
2. ✅ **Run verification script before major deployments**
3. ✅ **Use 2nd Gen functions (onRequest/onCall from v2)**
4. ✅ **Organize functions by feature/module**
5. ✅ **Document function purpose and usage**

## Next Steps

1. **Retry dropboxOAuthCallbackHttp deployment** when service identity API is available
2. **Run verification script regularly** to ensure compliance
3. **Follow single source of truth rules** for all new functions

## Files Reference

- `shared-firebase-functions/src/index.ts` - Main export file
- `shared-firebase-functions/firebase.json` - Functions configuration (ONLY place)
- `shared-firebase-functions/scripts/verify-single-source-of-truth.sh` - Verification
- `shared-firebase-functions/SINGLE_SOURCE_OF_TRUTH.md` - Guidelines
- `shared-firebase-functions/MIGRATION_AND_DEPLOYMENT_FIX.md` - Migration guide
