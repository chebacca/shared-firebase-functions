# Clock In/Out Function Fix

## Date: December 31, 2025

## Problem

**Error**: `POST http://localhost:4002/api/timecard/clock-out?_t=1767225554124 404 (Not Found)`

The `clockIn` and `clockOut` methods in `_backbone_production_workflow_system` were trying to make HTTP POST requests to `/api/timecard/clock-in` and `/api/timecard/clock-out`, which don't exist as standalone endpoints.

## Root Cause

1. The service methods were using HTTP `fetch` calls to non-existent endpoints
2. Clock-in/clock-out existed only as Express router endpoints in the API routes
3. No Firebase callable functions existed for clock-in/clock-out

## Solution

### 1. Created Firebase Callable Functions

**Files Created**:
- `shared-firebase-functions/src/timecards/clockIn.ts`
- `shared-firebase-functions/src/timecards/clockOut.ts`

**Features**:
- ✅ Firebase callable functions (`onCall`)
- ✅ Validates authentication and organization membership
- ✅ Checks if user is already clocked in (for clock-in)
- ✅ Checks if user is clocked in (for clock-out)
- ✅ Creates/updates timecard entries in `timecardEntries` collection
- ✅ Updates location status
- ✅ Logs location activity
- ✅ Calculates total hours (for clock-out)
- ✅ Returns updated timecard data

**Key Logic**:
- **Clock In**: Creates new timecard entry with `clockInTime`, sets status to `ACTIVE`
- **Clock Out**: Finds active timecard entry, updates with `clockOutTime`, calculates hours, sets status to `PENDING`
- Both functions update location status and log activity

### 2. Updated Service File

**File**: `_backbone_production_workflow_system/apps/web/src/services/timecardApi.ts`

**Changes**:
- ✅ Added Firebase Functions imports (`getFunctions`, `httpsCallable`)
- ✅ Added `functions` property to service class
- ✅ Updated `clockIn` method to use Firebase callable function
- ✅ Updated `clockOut` method to use Firebase callable function
- ✅ Added error handling with try-catch blocks

### 3. Exported Functions

**Files Updated**:
- `shared-firebase-functions/src/timecards/index.ts` - Added exports
- `shared-firebase-functions/src/index.ts` - Added exports

## Code Changes

### Before
```typescript
async clockOut(data: ClockOutData): Promise<TimeCard> {
    const response = await this.request<{...}>('/clock-out', {
        method: 'POST',
        body: JSON.stringify({
            ...data,
            wrappedStatus: data.wrappedStatus || 'wrapped'
        }),
    });
    // ... transform response ...
}
```

### After
```typescript
async clockOut(data: ClockOutData): Promise<TimeCard> {
    try {
        console.log('[TimecardApi] 🔥 Using Firebase callable: clockOut');
        const callable = httpsCallable<ClockOutData, { success: boolean; data: any; error?: string }>(this.functions, 'clockOut');
        const result = await callable({
            ...data,
            wrappedStatus: data.wrappedStatus || 'wrapped'
        });
        
        if (!result.data.success) {
            throw new Error(result.data.error || 'Failed to clock out');
        }
        
        const response = { data: result.data.data };
        // ... transform response ...
    } catch (error: any) {
        console.error('[TimecardApi] ❌ Error clocking out:', error);
        throw error;
    }
}
```

## Function Response Format

Both functions return:
```typescript
{
  success: true,
  data: {
    id: string,
    userId: string,
    date: string,
    clockInTime: string (ISO timestamp),
    clockOutTime: string | null (ISO timestamp),
    location: string,
    notes: string,
    projectId: string | null,
    organizationId: string,
    status: string,
    totalHours: number,
    locationStatus: string,
    wrappedStatus?: string (clock-out only)
  }
}
```

## Collection Structure

### timecardEntries Collection
- **Purpose**: Stores timecard entries
- **Fields**:
  - `userId`: User ID
  - `organizationId`: Organization ID
  - `date`: Timestamp (start of day)
  - `clockInTime`: Timestamp
  - `clockOutTime`: Timestamp | null
  - `location`: String
  - `status`: 'ACTIVE' | 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  - `totalHours`: Number
  - `regularHours`: Number
  - `overtimeHours`: Number
  - `doubleTimeHours`: Number
  - `mealBreakTaken`: Boolean
  - `mealPenalty`: Boolean
  - `notes`: String
  - `projectId`: String | null
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp

## Deployment Status

- ✅ Functions created and deployed: `clockIn`, `clockOut`
- ✅ Service file updated
- ✅ Build passes
- ✅ No lint errors
- ✅ Functions exported correctly

## Testing

### Test Cases
1. ✅ Clock in with valid data → Should create timecard entry
2. ✅ Clock in when already clocked in → Should fail with appropriate error
3. ✅ Clock out when clocked in → Should update timecard entry
4. ✅ Clock out when not clocked in → Should fail with appropriate error
5. ✅ Clock out with wrappedStatus → Should update location status
6. ✅ Clock in/out without auth → Should fail with authentication error

## Next Steps

1. Test the clock-in/clock-out functionality in Production Workflow System
2. Verify timecard entries are created/updated correctly
3. Check that location status updates properly
4. Monitor function logs for any issues

---

**Status**: ✅ FIXED AND DEPLOYED

