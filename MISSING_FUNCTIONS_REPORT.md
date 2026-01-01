# Missing Functions Report

Generated: $(date)

## Critical Missing Functions

### Timecard Approval Functions

These functions are called from the frontend but don't exist as callable functions:

1. **`takeApprovalAction`** - CRITICAL
   - Called from: `_backbone_timecard_management_system`, `_backbone_iwm`
   - Purpose: Approve/reject/escalate timecard submissions
   - Status: Handled by `timecardApprovalApi` HTTP function, but needs callable version
   - Priority: CRITICAL

2. **`getTimecardHistory`** - CRITICAL
   - Called from: `_backbone_timecard_management_system`, `_backbone_iwm`
   - Purpose: Get approval history for a specific timecard
   - Status: Different from `getApprovalHistory` (which gets org-wide history)
   - Priority: CRITICAL

3. **`getAllDirectReports`** - HIGH
   - Called from: `_backbone_timecard_management_system`, `_backbone_iwm`
   - Purpose: Get all direct reports (not filtered by manager)
   - Status: `getDirectReports` exists but requires managerId parameter
   - Priority: HIGH

4. **`createDirectReport`** - HIGH
   - Called from: `_backbone_timecard_management_system`, `_backbone_iwm`
   - Purpose: Create direct report relationship
   - Status: Missing
   - Priority: HIGH

5. **`updateDirectReport`** - HIGH
   - Called from: `_backbone_timecard_management_system`, `_backbone_iwm`
   - Purpose: Update direct report relationship
   - Status: Missing
   - Priority: HIGH

6. **`deactivateDirectReport`** - HIGH
   - Called from: `_backbone_timecard_management_system`, `_backbone_iwm`
   - Purpose: Deactivate direct report relationship
   - Status: Missing
   - Priority: HIGH

### Timecard Assignment Functions

7. **`createTimecardAssignment`** - HIGH
   - Called from: `_backbone_timecard_management_system`
   - Purpose: Assign timecard template to user/project
   - Status: Missing
   - Priority: HIGH

8. **`updateTimecardAssignment`** - HIGH
   - Called from: `_backbone_timecard_management_system`
   - Purpose: Update timecard assignment
   - Status: Missing
   - Priority: HIGH

9. **`deleteTimecardAssignment`** - HIGH
   - Called from: `_backbone_timecard_management_system`
   - Purpose: Remove timecard assignment
   - Status: Missing
   - Priority: HIGH

### Timecard Utility Functions

10. **`getWeeklySummary`** - MEDIUM
    - Called from: `_backbone_timecard_management_system`
    - Purpose: Get weekly timecard summary
    - Status: Missing
    - Priority: MEDIUM

11. **`bulkApproveTimecards`** - HIGH
    - Called from: `_backbone_production_workflow_system`, `_backbone_timecard_management_system`
    - Purpose: Bulk approve multiple timecards
    - Status: Missing
    - Priority: HIGH

## Implementation Plan

### Phase 1: Timecard Approval Functions (Priority: CRITICAL)
- Create `takeApprovalAction` callable function
- Create `getTimecardHistory` callable function
- Location: `shared-firebase-functions/src/timecards/approval/`

### Phase 2: Direct Report Functions (Priority: HIGH)
- Create `getAllDirectReports` callable function
- Create `createDirectReport` callable function
- Create `updateDirectReport` callable function
- Create `deactivateDirectReport` callable function
- Location: `shared-firebase-functions/src/timecards/directReports/`

### Phase 3: Timecard Assignment Functions (Priority: HIGH)
- Create `createTimecardAssignment` callable function
- Create `updateTimecardAssignment` callable function
- Create `deleteTimecardAssignment` callable function
- Location: `shared-firebase-functions/src/timecards/assignments/`

### Phase 4: Timecard Utility Functions (Priority: MEDIUM-HIGH)
- Create `getWeeklySummary` callable function
- Create `bulkApproveTimecards` callable function
- Location: `shared-firebase-functions/src/timecards/`

## Notes

- The `timecardApprovalApi` HTTP function handles many of these operations via HTTP endpoints
- Frontend code expects callable functions for better error handling and type safety
- All functions should follow the existing pattern: callable version only (HTTP versions removed to reduce CPU quota)

