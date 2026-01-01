# Timecard Approval Functions Migration Required

## Date: December 31, 2025

## 🚨 Critical Issue Found

Both **Clip Show Pro** and **Production Workflow System** are using **HTTP fetch calls** instead of **Firebase callable functions** for timecard approval and direct reports functionality.

## Problem

### Current Implementation (BROKEN)
Both projects use `timecardApprovalApi` service that makes HTTP fetch calls to:
- `${API_BASE_URL}/timecard/approvals` endpoints
- These endpoints **DO NOT EXIST** on the backend
- This causes **404 errors** and **broken functionality**

### What Should Be Used (WORKING)
Firebase callable functions that were just deployed:
- ✅ `getAllDirectReports` - Get all direct reports
- ✅ `getDirectReports` - Get user's direct reports  
- ✅ `createDirectReport` - Create direct report relationship
- ✅ `updateDirectReport` - Update direct report
- ✅ `deactivateDirectReport` - Deactivate direct report
- ✅ `takeApprovalAction` - Approve/reject/escalate timecards
- ✅ `getTimecardHistory` - Get timecard history
- ✅ `getPendingApprovals` - Get pending approvals
- ✅ `getApprovalHistory` - Get approval history
- ✅ `getMySubmissions` - Get user submissions

## Affected Files

### Clip Show Pro
- `_backbone_clip_show_pro/packages/web-browser/src/services/timecardApprovalApi.ts`
  - **Problem**: Uses HTTP fetch to non-existent endpoints
  - **Solution**: Replace with `httpsCallable` Firebase functions

### Production Workflow System
- `_backbone_production_workflow_system/apps/web/src/services/timecardApprovalApi.ts`
  - **Problem**: Uses HTTP fetch to non-existent endpoints
  - **Solution**: Replace with `httpsCallable` Firebase functions

## Impact

### Currently Broken Features
1. ❌ **Direct Reports Management**
   - Cannot view direct reports
   - Cannot create/update/deactivate direct report relationships
   - Manager info not loading

2. ❌ **Approval Workflows**
   - Cannot submit timecards for approval
   - Cannot approve/reject timecards
   - Cannot view pending approvals
   - Cannot view approval history

3. ❌ **Timecard Drawer**
   - Direct reports section shows errors
   - Submit for approval fails
   - Manager info not displayed

## Solution

### Step 1: Update Clip Show Pro

Replace HTTP fetch calls with Firebase callable functions in:
`_backbone_clip_show_pro/packages/web-browser/src/services/timecardApprovalApi.ts`

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// Replace HTTP fetch with callable functions
async getPendingApprovals(filters?: ApprovalFilters) {
  const callable = httpsCallable(functions, 'getPendingApprovals');
  const result = await callable({ filters });
  return result.data;
}

async getDirectReports() {
  const callable = httpsCallable(functions, 'getDirectReports');
  const result = await callable({});
  return result.data;
}

async getAllDirectReports() {
  const callable = httpsCallable(functions, 'getAllDirectReports');
  const result = await callable({});
  return result.data;
}

async takeApprovalAction(data: TimecardApprovalActionData) {
  const callable = httpsCallable(functions, 'takeApprovalAction');
  const result = await callable(data);
  return result.data;
}

async getTimecardHistory(timecardId: string) {
  const callable = httpsCallable(functions, 'getTimecardHistory');
  const result = await callable({ timecardId });
  return result.data;
}

async getApprovalHistory(filters?: ApprovalFilters) {
  const callable = httpsCallable(functions, 'getApprovalHistory');
  const result = await callable({ filters });
  return result.data;
}

async getMySubmissions(filters?: ApprovalFilters) {
  const callable = httpsCallable(functions, 'getMySubmissions');
  const result = await callable({ filters });
  return result.data;
}

async createDirectReport(data: DirectReportFormData) {
  const callable = httpsCallable(functions, 'createDirectReport');
  const result = await callable(data);
  return result.data;
}

async updateDirectReport(reportId: string, data: Partial<DirectReportFormData>) {
  const callable = httpsCallable(functions, 'updateDirectReport');
  const result = await callable({ reportId, ...data });
  return result.data;
}

async deactivateDirectReport(reportId: string) {
  const callable = httpsCallable(functions, 'deactivateDirectReport');
  const result = await callable({ reportId });
  return result.data;
}
```

### Step 2: Update Production Workflow System

Same changes needed in:
`_backbone_production_workflow_system/apps/web/src/services/timecardApprovalApi.ts`

## Testing Checklist

After migration:

### Direct Reports
- [ ] View direct reports list
- [ ] Create new direct report relationship
- [ ] Update existing direct report
- [ ] Deactivate direct report
- [ ] View manager info

### Approval Workflows
- [ ] Submit timecard for approval
- [ ] View pending approvals
- [ ] Approve timecard
- [ ] Reject timecard
- [ ] Escalate timecard
- [ ] View approval history
- [ ] View my submissions

### Timecard Drawer
- [ ] Direct reports section loads
- [ ] Manager info displays
- [ ] Submit for approval works
- [ ] Approval status shows correctly

## Priority: 🔴 CRITICAL

This migration is **critical** because:
1. Core timecard functionality is broken
2. Approval workflows don't work
3. Direct reports management is non-functional
4. Users cannot submit timecards for approval

## Estimated Time

- Clip Show Pro migration: 30 minutes
- Production Workflow System migration: 30 minutes
- Testing: 30 minutes
- **Total: 1.5 hours**

## Notes

- All Firebase callable functions are **already deployed** and working
- The functions use proper authentication and organization scoping
- The functions return standardized response formats
- No backend changes needed - only frontend migration

## Next Steps

1. Update `timecardApprovalApi.ts` in both projects
2. Replace HTTP fetch with Firebase callable functions
3. Test all approval and direct report workflows
4. Verify timecard drawer functionality
5. Monitor for errors

---

**Status**: Migration needed - functions deployed, frontend not updated

