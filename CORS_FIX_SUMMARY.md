# CORS Fix for Accounting Approval Functions

## Issue
CORS errors when calling Firebase Functions from `https://localhost:4010` (Mobile Companion app):
- `getAccountingApprovalAlerts` - CORS preflight failure
- `checkManagerApprovalThreshold` - CORS preflight failure

## Root Causes

1. **HTTPS Localhost Not Allowed**: The CORS configuration only included `http://localhost:4010` but the app runs on `https://localhost:4010`
2. **Function Call Format Mismatch**: Functions are `onRequest` (HTTP) but being called with `httpsCallable` (callable), which sends POST requests with data in body, not query params
3. **Role Restriction**: Managers couldn't view their own accounting alerts

## Fixes Applied

### 1. Updated CORS Headers (`shared-firebase-functions/src/shared/utils.ts`)
- Added HTTPS localhost variants for all ports (4000-4011, 5173)
- The existing localhost check already handles both HTTP and HTTPS, but explicit entries ensure compatibility

### 2. Updated Function Request Handling (`shared-firebase-functions/src/accounting/accountingApprovalFunctions.ts`)

#### `getAccountingApprovalAlerts`:
- Now supports both GET (query params) and POST (body) requests
- Extracts data from `req.body?.data || req.body || {}` for POST requests
- Relaxed role check: Managers can now view their own alerts (when `managerId` matches their user ID)

#### `checkManagerApprovalThreshold`:
- Updated to handle callable format: `req.body?.data || req.body || {}`
- Already was a POST function, just needed to handle wrapped data format

## Testing

After deploying these changes:

1. **Test from Mobile Companion** (`https://localhost:4010`):
   ```javascript
   // Should work without CORS errors
   const functions = getFirebaseFunctions();
   const getAlertsFn = httpsCallable(functions, 'getAccountingApprovalAlerts');
   const result = await getAlertsFn({
     status: 'PENDING',
     managerId: userId
   });
   ```

2. **Test Direct HTTP** (for accounting dashboard):
   ```bash
   curl -X GET \
     'https://us-central1-backbone-logic.cloudfunctions.net/getAccountingApprovalAlerts?status=PENDING&managerId=USER_ID' \
     -H 'Authorization: Bearer TOKEN'
   ```

## Deployment

Deploy the updated functions:
```bash
cd shared-firebase-functions
firebase deploy --only functions:getAccountingApprovalAlerts,functions:checkManagerApprovalThreshold
```

## Notes

- The functions maintain backward compatibility with direct HTTP calls (GET/POST)
- `httpsCallable` works with `onRequest` functions by sending POST requests with data wrapped in `data` property
- Managers can only view alerts where they are the `managerId` (their own alerts)
- Accounting personnel can view all alerts for their organization
