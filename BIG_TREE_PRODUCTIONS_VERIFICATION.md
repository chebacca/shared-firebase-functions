# Big Tree Productions Verification

## Organization Information

**Organization ID:** `big-tree-productions`

## Functions Required for Big Tree Productions

### Timecard Management
- ✅ `getTimecardTemplates` - Get timecard templates
- ✅ `createTimecardTemplate` - Create timecard template
- ✅ `updateTimecardTemplate` - Update timecard template
- ✅ `deleteTimecardTemplate` - Delete timecard template
- ✅ `getTimecardAssignments` - Get timecard assignments
- ✅ `createTimecardAssignment` - Create timecard assignment
- ✅ `updateTimecardAssignment` - Update timecard assignment
- ✅ `deleteTimecardAssignment` - Delete timecard assignment
- ✅ `getAllTimecards` - Get all timecards
- ✅ `getTimecardUsers` - Get timecard users
- ✅ `getTimecardConfigurations` - Get timecard configurations
- ✅ `getWeeklySummary` - Get weekly summary

### Timecard Approval
- ✅ `getPendingApprovals` - Get pending approvals
- ✅ `getMySubmissions` - Get my submissions
- ✅ `getApprovalHistory` - Get approval history
- ✅ `takeApprovalAction` - Take approval action
- ✅ `getTimecardHistory` - Get timecard history
- ✅ `bulkApproveTimecards` - Bulk approve timecards

### Direct Reports
- ✅ `getDirectReports` - Get direct reports (filtered)
- ✅ `getAllDirectReports` - Get all direct reports
- ✅ `createDirectReport` - Create direct report
- ✅ `updateDirectReport` - Update direct report
- ✅ `deactivateDirectReport` - Deactivate direct report

### Budgeting
- ✅ `getBudgets` - Get budgets
- ✅ `calculateBudgetVariance` - Calculate budget variance
- ✅ `syncTimecardToBudget` - Sync timecard to budget
- ✅ `aggregateTimecardCosts` - Aggregate timecard costs

### Project Management
- ✅ `getProjectTeamMembers` - Get project team members

## Verification Steps

### Step 1: Verify Organization Claims
```bash
# Check Big Tree Productions users have correct claims
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().getUserByEmail('admin@bigtreeproductions.com')
  .then(user => {
    console.log('Claims:', user.customClaims);
    console.log('Organization ID:', user.customClaims?.organizationId);
  });
"
```

**Expected:** `organizationId: 'big-tree-productions'`

### Step 2: Test Organization-Scoped Queries

All functions should:
1. Verify user authentication
2. Get user's organization from custom claims
3. Verify organization match in queries
4. Return only data for user's organization

### Step 3: Test Direct Report Management

1. Create direct report relationship
2. Get all direct reports
3. Update direct report
4. Deactivate direct report

### Step 4: Test Timecard Approval Workflow

1. Submit timecard
2. Get pending approvals
3. Take approval action
4. Get timecard history
5. Bulk approve timecards

### Step 5: Test Timecard Assignments

1. Create timecard assignment
2. Get timecard assignments
3. Update timecard assignment
4. Delete timecard assignment

## Big Tree Productions Specific Scripts

### Grant Access Script
Location: `grant-all-apps-access-admin-bigtree.cjs`

This script grants Big Tree Productions users access to all apps:
- clipshow-pro
- cns
- iwm
- timecard
- callsheet
- cuesheet

### Direct Report Managers Script
Location: `_backbone_timecard_management_system/create-big-tree-direct-report-managers.cjs`

This script creates direct report managers for Big Tree Productions.

## Testing Checklist

- [ ] Big Tree Productions users can access timecard functions
- [ ] Organization-scoped queries return only Big Tree data
- [ ] Direct report management works for Big Tree
- [ ] Timecard approval workflow works for Big Tree
- [ ] Timecard assignments work for Big Tree
- [ ] Budget calculations work for Big Tree
- [ ] All functions verify organization access correctly

## Notes

- All functions are organization-scoped
- Functions verify `organizationId` from user custom claims
- Functions verify organization match in queries
- Big Tree Productions organization ID: `big-tree-productions`

