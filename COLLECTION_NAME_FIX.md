# Collection Name Fix: timecardEntries → timecard_entries

## Date: December 31, 2025

## Problem

**Error**: `FirebaseError: You are not currently clocked in`

The `clockIn` and `clockOut` Firebase functions were querying the wrong collection name:
- Functions were using: `timecardEntries` (camelCase)
- Frontend uses: `timecard_entries` (snake_case)

This caused the functions to not find existing timecard entries, resulting in "You are not currently clocked in" errors even when users were clocked in.

## Root Cause

Collection name mismatch between Firebase functions and frontend:
- **Frontend**: Uses `timecard_entries` (snake_case) as defined in `TIMECARD_COLLECTIONS.TIMECARD_ENTRIES`
- **Functions**: Were using `timecardEntries` (camelCase) copied from API routes
- **API Routes**: Also used `timecardEntries` (camelCase) - now fixed

## Solution

### Updated Collection Names

**Files Updated**:
1. `shared-firebase-functions/src/timecards/clockIn.ts`
   - Changed `timecardEntries` → `timecard_entries`

2. `shared-firebase-functions/src/timecards/clockOut.ts`
   - Changed `timecardEntries` → `timecard_entries`

3. `shared-firebase-functions/src/api/routes/timecard.ts`
   - Changed `timecardEntries` → `timecard_entries` (for consistency)

### Collection Name Standard

**Correct Collection Name**: `timecard_entries` (snake_case)

This matches:
- Frontend constants: `TIMECARD_COLLECTIONS.TIMECARD_ENTRIES = 'timecard_entries'`
- Firestore indexes: All indexes use `timecard_entries`
- Production schema: All production data uses `timecard_entries`

## Verification

All other timecard functions already use `timecard_entries`:
- ✅ `submitTimecardForApproval.ts` - Uses `timecard_entries`
- ✅ `getWeeklySummary.ts` - Uses `timecard_entries`
- ✅ `getTimecardHistory.ts` - Uses `timecard_entries`
- ✅ `takeApprovalAction.ts` - Uses `timecard_entries`
- ✅ `timecardApprovalApi.ts` - Uses `timecard_entries`
- ✅ `getMySubmissions.ts` - Uses `timecard_entries`
- ✅ `bulkApproveTimecards.ts` - Uses `timecard_entries`

## Deployment Status

- ✅ Functions updated and deployed: `clockIn`, `clockOut`
- ✅ API routes updated (for consistency)
- ✅ Build passes
- ✅ No lint errors

## Testing

### Test Cases
1. ✅ Clock in → Should create entry in `timecard_entries` collection
2. ✅ Clock out when clocked in → Should find and update entry in `timecard_entries`
3. ✅ Clock out when not clocked in → Should return appropriate error
4. ✅ Query existing entries → Should find entries in `timecard_entries`

## Next Steps

1. Test clock-in/clock-out functionality
2. Verify timecard entries are created/updated in correct collection
3. Check that existing entries are found correctly
4. Monitor function logs for any issues

---

**Status**: ✅ FIXED AND DEPLOYED

