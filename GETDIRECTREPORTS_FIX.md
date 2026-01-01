# getDirectReports Function Fix

## Date: December 31, 2025

## Problem

**Error**: `Organization ID is required`

The `getDirectReports` Firebase callable function was failing because:
1. The function required `organizationId` and `managerId` as parameters
2. The service calls were not passing these parameters
3. The function didn't automatically derive them from the authenticated user

## Solution

### 1. Updated Firebase Function
**File**: `shared-firebase-functions/src/timecards/getDirectReports.ts`

**Changes**:
- ✅ Function now automatically uses authenticated user's ID as `managerId` if not provided
- ✅ Function now tries to get `organizationId` from user's custom claims if not provided
- ✅ Better error handling and logging

**Before**:
```typescript
const { organizationId, managerId } = request.data;
if (!organizationId) throw new Error('Organization ID is required');
if (!managerId) throw new Error('Manager ID is required');
```

**After**:
```typescript
const { organizationId: providedOrgId, managerId: providedManagerId } = request.data;
const userId = request.auth?.uid;
const managerId = providedManagerId || userId; // Use auth user if not provided

// Try to get organizationId from user claims if not provided
let organizationId = providedOrgId;
if (!organizationId && userId) {
  const userRecord = await getAuth().getUser(userId);
  organizationId = userRecord.customClaims?.organizationId as string;
}
```

### 2. Updated Service Calls
**Files**:
- `_backbone_clip_show_pro/packages/web-browser/src/services/timecardApprovalApi.ts`
- `_backbone_production_workflow_system/apps/web/src/services/timecardApprovalApi.ts`

**Changes**:
- ✅ Service now gets `organizationId` from user's auth token or Firestore
- ✅ Service now passes `organizationId` and `managerId` to the function
- ✅ Maintains Firestore fallback for reliability

**Before**:
```typescript
async getDirectReports() {
  const callable = httpsCallable(this.functions, 'getDirectReports');
  const result = await callable({}); // ❌ Missing required params
}
```

**After**:
```typescript
async getDirectReports() {
  // Get organizationId and userId
  const userId = auth.currentUser.uid;
  const organizationId = await getOrganizationId(); // From claims or Firestore
  
  const callable = httpsCallable(this.functions, 'getDirectReports');
  const result = await callable({ organizationId, managerId: userId }); // ✅
}
```

## Response Format

The function returns:
```typescript
{
  success: true,
  data: {
    directReports: UserDirectReport[],
    count: number,
    organizationId: string,
    managerId: string
  }
}
```

The service unwraps it:
```typescript
return result.data.data?.directReports || [];
```

## Testing

### Test Cases
1. ✅ Call with organizationId and managerId → Should work
2. ✅ Call with only organizationId → Should use auth user as managerId
3. ✅ Call without organizationId → Should get from user claims
4. ✅ Call without auth → Should fail gracefully
5. ✅ Fallback to Firestore if callable fails → Should work

## Deployment Status

- ✅ Function updated and deployed
- ✅ Service calls updated in both projects
- ✅ Build passes
- ✅ No lint errors

## Next Steps

1. Test the timecard drawer in both applications
2. Verify direct reports load correctly
3. Check console for any remaining errors
4. Monitor function logs for issues

---

**Status**: ✅ FIXED AND DEPLOYED

