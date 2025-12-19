# Settings API 500 Error Fix

## Problem
The `/api/settings/user` endpoint was returning a 500 Internal Server Error, likely due to:
1. Missing Firestore composite index for the query
2. Insufficient error handling
3. No fallback mechanism

## Solution Implemented

### 1. Enhanced Error Handling
- Added detailed logging for debugging
- Better error messages with error codes
- Logs error stack traces for troubleshooting

### 2. Fallback Query Mechanism
- If the composite index query fails, falls back to a userId-only query
- Filters by organizationId in memory
- Returns empty settings array as last resort (app can work with defaults)

### 3. Improved Error Detection
- Detects missing index errors specifically
- Handles Firestore error codes (FAILED_PRECONDITION = 9)
- Provides helpful warnings to developers

## Code Changes

### `/shared-firebase-functions/src/api/index.ts`
- Enhanced the `/settings/user` endpoint with:
  - Try-catch around Firestore query
  - Index error detection
  - Fallback query mechanism
  - Better error logging

## Firestore Index Required

For optimal performance, create a composite index:

**Collection:** `settings`
**Fields:**
- `userId` (Ascending)
- `organizationId` (Ascending)

**Index Name:** `settings_userId_organizationId`

### Creating the Index

1. **Via Firebase Console:**
   - Go to Firestore → Indexes
   - Click "Create Index"
   - Collection: `settings`
   - Add fields: `userId` (Ascending), `organizationId` (Ascending)
   - Create

2. **Via firestore.indexes.json:**
   Add to `shared-firebase-config/firestore.indexes.json`:
   ```json
   {
     "indexes": [
       {
         "collectionGroup": "settings",
         "queryScope": "COLLECTION",
         "fields": [
           {
             "fieldPath": "userId",
             "order": "ASCENDING"
           },
           {
             "fieldPath": "organizationId",
             "order": "ASCENDING"
           }
         ]
       }
     ]
   }
   ```

## Testing

After deploying:
1. The endpoint should work even without the index (using fallback)
2. With the index, it will be faster
3. Check Firebase Functions logs for detailed error information

## Notes

- The app will continue to work even if the query fails (returns empty settings)
- Default settings are used when no settings are found
- The fallback query is slightly less efficient but functional


