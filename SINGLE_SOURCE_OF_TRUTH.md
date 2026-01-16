# 🔥 Single Source of Truth for Firebase Functions

## Overview

All Firebase Cloud Functions MUST be defined **ONLY** in `shared-firebase-functions/`. This ensures:
- ✅ No duplicate function definitions
- ✅ Consistent deployment process
- ✅ Easier maintenance and updates
- ✅ No version conflicts between projects

## Rules

### ✅ DO

1. **Define all functions in `shared-firebase-functions/src/`**
   - Organize by feature/module (e.g., `src/dropbox/`, `src/google/`, etc.)
   - Export functions in `src/index.ts`

2. **Deploy from `shared-firebase-functions/`**
   - Always run deployment commands from this directory
   - Use the provided deployment scripts

3. **Use shared functions from all apps**
   - All apps should call functions deployed from `shared-firebase-functions/`
   - No app-specific function definitions

### ❌ DON'T

1. **Don't define functions in app directories**
   - No `functions/` folders in individual apps
   - No `firebase.json` with `functions` configuration in apps

2. **Don't duplicate function logic**
   - If you need similar functionality, extend existing functions
   - Use parameters/flags to handle different use cases

3. **Don't deploy functions from app directories**
   - All deployments must come from `shared-firebase-functions/`

## Directory Structure

```
shared-firebase-functions/
├── src/
│   ├── index.ts              # Main export file (exports all functions)
│   ├── dropbox/              # Dropbox integration functions
│   ├── google/               # Google Drive integration functions
│   ├── box/                  # Box integration functions
│   ├── slack/                # Slack integration functions
│   ├── workflow/             # Production Workflow System functions
│   ├── timecards/            # Timecard Management System functions
│   ├── callsheet/            # Call Sheet functions
│   └── ...                   # Other function modules
├── firebase.json             # Functions configuration (ONLY place this exists)
├── deploy-all.sh             # Deploy all functions
├── deploy-shared.sh          # Deploy shared functions only
└── scripts/
    └── verify-single-source-of-truth.sh  # Verification script
```

## Verification

Run the verification script to ensure single source of truth:

```bash
cd shared-firebase-functions
./scripts/verify-single-source-of-truth.sh
```

This script checks:
- ✅ Functions are only defined in `shared-firebase-functions/`
- ✅ No duplicate function definitions in other projects
- ✅ No `firebase.json` with functions config in other projects
- ✅ All functions are properly exported in `index.ts`

## Deployment Process

### 1. Build Functions

```bash
cd shared-firebase-functions
pnpm run build
```

### 2. Deploy Functions

**Deploy all functions:**
```bash
./deploy-all.sh
```

**Deploy specific functions:**
```bash
firebase deploy --only functions:functionName1,functions:functionName2 --project backbone-logic
```

**Deploy shared functions only:**
```bash
./deploy-shared.sh
```

### 3. Verify Deployment

```bash
firebase functions:list --project backbone-logic
```

## Migration from 1st Gen to 2nd Gen

If you encounter the error:
```
Error: Upgrading from 1st Gen to 2nd Gen is not yet supported
```

**Solution:**
1. Delete the old 1st Gen function:
   ```bash
   firebase functions:delete functionName --region us-central1 --force --project backbone-logic
   ```

2. Redeploy as 2nd Gen:
   ```bash
   firebase deploy --only functions:functionName --project backbone-logic
   ```

## Function Definition Patterns

### ✅ Correct (2nd Gen - Recommended)

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { onCall } from 'firebase-functions/v2/https';

// HTTP Function
export const myHttpFunction = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    // Function logic
  }
);

// Callable Function
export const myCallableFunction = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    // Function logic
  }
);
```

### ❌ Incorrect (1st Gen - Deprecated)

```typescript
import * as functions from 'firebase-functions';

// Don't use this pattern
export const myFunction = functions.https.onRequest(async (req, res) => {
  // Function logic
});
```

## Troubleshooting

### Function Not Found After Deployment

1. Check that function is exported in `src/index.ts`
2. Verify build completed successfully: `pnpm run build`
3. Check deployed functions: `firebase functions:list --project backbone-logic`
4. Redeploy if needed: `firebase deploy --only functions:functionName`

### Duplicate Function Definitions

1. Run verification script: `./scripts/verify-single-source-of-truth.sh`
2. Remove duplicate definitions from other projects
3. Ensure all functions are in `shared-firebase-functions/`

### Migration Issues

1. Delete old 1st Gen function first
2. Then deploy 2nd Gen version
3. Verify function is working after deployment

## Best Practices

1. **Always deploy from `shared-firebase-functions/`**
2. **Run verification script before major deployments**
3. **Use 2nd Gen functions (onRequest/onCall from v2)**
4. **Organize functions by feature/module**
5. **Document function purpose and usage**
6. **Test functions locally before deploying**

## Related Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Detailed deployment guide
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development setup and workflow
