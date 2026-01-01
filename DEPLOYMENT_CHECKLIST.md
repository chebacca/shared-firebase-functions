# Deployment Checklist

## Pre-Deployment Verification

### Build Verification
- [x] TypeScript compilation passes
- [x] No linter errors
- [x] All exports verified

### Function Verification
- [x] All missing functions created
- [x] All functions exported in `src/index.ts`
- [x] All critical HTTP functions kept
- [x] All integration status functions exported

### Code Quality
- [x] No TypeScript errors
- [x] No unused imports
- [x] All functions follow organization-scoped pattern
- [x] All functions verify authentication

## Deployment Steps

### Step 1: Build Functions
```bash
cd shared-firebase-functions
npm run build
```

**Expected Result:** Build succeeds with no errors

### Step 2: Verify Exports
```bash
# Check that all new functions are exported
grep -E "takeApprovalAction|getTimecardHistory|getAllDirectReports|createDirectReport|updateDirectReport|deactivateDirectReport|createTimecardAssignment|updateTimecardAssignment|deleteTimecardAssignment|getWeeklySummary|bulkApproveTimecards" src/index.ts
```

**Expected Result:** All functions appear in exports

### Step 3: Deploy Shared Resources First
```bash
cd _abackbone_permissions_rules_scripts
./deploy-shared-resources.sh
```

**This deploys:**
- Firestore rules
- Storage rules
- Firestore indexes
- Firebase Functions

### Step 4: Deploy Functions
```bash
cd shared-firebase-functions
firebase deploy --only functions
```

**Note:** If quota errors occur:
- Wait 2-3 minutes between deployments
- Deploy in batches using `deploy-batch.sh`
- Or deploy specific functions: `firebase deploy --only functions:takeApprovalAction,functions:getTimecardHistory`

### Step 5: Verify Deployment
```bash
# List all functions
firebase functions:list --region us-central1

# Verify new functions are deployed
firebase functions:list --region us-central1 | grep -E "takeApprovalAction|getTimecardHistory|getAllDirectReports|createDirectReport|updateDirectReport|deactivateDirectReport|createTimecardAssignment|updateTimecardAssignment|deleteTimecardAssignment|getWeeklySummary|bulkApproveTimecards"
```

**Expected Result:** All new functions appear in the list

## Post-Deployment Testing

### Test New Functions

**Timecard Approval:**
```bash
# Test takeApprovalAction
curl -X POST https://us-central1-backbone-logic.cloudfunctions.net/takeApprovalAction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"data": {"approvalId": "test-id", "action": "approve", "comments": "Test approval"}}'
```

**Direct Reports:**
```bash
# Test getAllDirectReports
curl -X POST https://us-central1-backbone-logic.cloudfunctions.net/getAllDirectReports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"data": {"organizationId": "big-tree-productions"}}'
```

### Test Big Tree Productions Access

1. Login as Big Tree Productions user
2. Test timecard approval workflow
3. Test direct report management
4. Test timecard assignments
5. Verify organization-scoped queries work

## Rollback Plan

If deployment fails or functions don't work:

1. **Revert code changes:**
   ```bash
   git revert <commit-hash>
   ```

2. **Redeploy previous version:**
   ```bash
   firebase deploy --only functions
   ```

3. **Delete problematic functions:**
   ```bash
   firebase functions:delete <functionName> --region us-central1 --force
   ```

## Success Criteria

- [ ] All functions build successfully
- [ ] All functions deploy successfully
- [ ] All functions appear in Firebase Console
- [ ] Frontend can call all required functions
- [ ] Big Tree Productions workflows function correctly
- [ ] No breaking changes to existing functionality

## Troubleshooting

### Build Errors
- Check TypeScript compilation errors
- Verify all imports are correct
- Check for missing dependencies

### Deployment Errors
- Check quota limits
- Verify Firebase project access
- Check function naming conflicts

### Runtime Errors
- Check function logs in Firebase Console
- Verify authentication tokens
- Verify organization IDs
- Check Firestore permissions

## Notes

- All new functions are callable-only (no HTTP versions)
- Functions follow organization-scoped pattern
- Functions verify user authentication
- Functions verify organization access

