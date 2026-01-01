# getDirectReports Collection Fix

## Date: December 31, 2025

## Problem

**Issue**: Clip Show Pro was returning 0 direct reports even though direct report relationships exist in Firestore.

**Root Cause**: The `getDirectReports` Firebase function was querying the wrong collection (`teamMembers`) instead of the correct collections (`userDirectReports` and `directReports`).

## Solution

### Updated Function Query Logic

**File**: `shared-firebase-functions/src/timecards/getDirectReports.ts`

**Before**:
- ❌ Queried `teamMembers` collection
- ❌ Used `teamMember.userId` field
- ❌ Returned limited data structure

**After**:
- ✅ Queries `userDirectReports` collection first (primary)
- ✅ Falls back to `directReports` collection if no results
- ✅ Uses `employeeId` field from direct report documents
- ✅ Returns enriched data structure matching frontend expectations

### Key Changes

1. **Primary Query**: `userDirectReports` collection
   ```typescript
   db.collection('userDirectReports')
     .where('organizationId', '==', organizationId)
     .where('managerId', '==', managerId)
     .where('isActive', '==', true)
   ```

2. **Fallback Query**: `directReports` collection
   ```typescript
   db.collection('directReports')
     .where('organizationId', '==', organizationId)
     .where('managerId', '==', managerId)
     .where('isActive', '==', true)
   ```

3. **Data Structure**: Now returns enriched direct report data:
   ```typescript
   {
     id: string,                    // Direct report document ID
     employeeId: string,            // Employee user ID
     managerId: string,             // Manager user ID
     email: string,                // Employee email
     displayName: string,           // Employee display name
     firstName: string,             // Employee first name
     lastName: string,             // Employee last name
     role: string,                 // Employee role
     isActive: boolean,            // Direct report relationship active
     canApproveTimecards: boolean, // Can approve timecards
     canApproveOvertime: boolean,  // Can approve overtime
     department: string,           // Department
     createdAt: Timestamp,         // Relationship created date
     effectiveDate: Timestamp      // Relationship effective date
   }
   ```

## Collection Structure

### userDirectReports Collection
- **Purpose**: Primary collection for direct report relationships
- **Fields**:
  - `organizationId`: Organization ID
  - `managerId`: Manager user ID
  - `employeeId`: Employee user ID
  - `isActive`: Boolean
  - `canApproveTimecards`: Boolean
  - `canApproveOvertime`: Boolean
  - `department`: String
  - `createdAt`: Timestamp
  - `effectiveDate`: Timestamp

### directReports Collection (Fallback)
- **Purpose**: Legacy/backward compatibility collection
- **Fields**: Same as `userDirectReports`

### teamMembers Collection (Not Used)
- **Purpose**: Team membership, not direct report relationships
- **Note**: This collection is for team membership, not manager-employee relationships

## Deployment Status

- ✅ Function updated and deployed
- ✅ Both callable and HTTP versions updated
- ✅ Build passes
- ✅ No lint errors

## Testing

### Test Cases
1. ✅ Query with userDirectReports data → Should return direct reports
2. ✅ Query with only directReports data → Should return direct reports (fallback)
3. ✅ Query with no direct reports → Should return empty array
4. ✅ Query with different organization → Should return empty array
5. ✅ Query with inactive direct reports → Should exclude inactive

## Next Steps

1. Test the timecard drawer in Clip Show Pro
2. Verify direct reports load correctly
3. Check that manager information displays properly
4. Monitor function logs for any issues

---

**Status**: ✅ FIXED AND DEPLOYED

