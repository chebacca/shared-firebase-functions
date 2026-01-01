# Deployment Quota Issues - Fix Guide

## 🔴 Current Issues

### 1. Mutation Quota Exceeded
- **Error**: "Quota exceeded for quota metric 'Per project mutation requests'"
- **Limit**: ~60 mutations per minute per region
- **Solution**: Deploy in smaller batches or wait between deployments

### 2. CPU Quota Exceeded ⚠️ **CRITICAL**
- **Error**: "Quota exceeded for total allowable CPU per project per region"
- **Cause**: Too many Cloud Run services (Firebase Functions v2 run on Cloud Run)
- **Impact**: Functions can't start/update because there's not enough CPU quota

### 3. Orphaned Function
- **`removeParticipantHttp`** - Removed from code but still exists in Firebase
- **Action**: Delete from Firebase manually

## 🛠️ Solutions

### Immediate Actions

#### 1. Delete Orphaned Function
```bash
# Delete removeParticipantHttp from Firebase
cd shared-firebase-functions
firebase functions:delete removeParticipantHttp --region us-central1 --force
```

#### 2. Reduce CPU Usage
You have several options:

**Option A: Delete Unused Functions** (Recommended)
- Identify and delete functions that are no longer needed
- Each function consumes CPU quota even when idle

**Option B: Request Quota Increase**
- Go to: https://console.cloud.google.com/iam-admin/quotas
- Filter by: "Cloud Run API" → "CPU per region"
- Request increase for `us-central1` region

**Option C: Reduce Function CPU Allocation**
- Review functions with high CPU allocation
- Reduce `availableCpu` in function configs where possible
- Default is often 1 CPU per function

**Option D: Deploy to Multiple Regions**
- Spread functions across regions (us-central1, us-east1, etc.)
- Each region has separate CPU quota

### 3. Deploy in Batches
Instead of deploying all functions at once:

```bash
# Deploy only critical functions first
firebase deploy --only functions:appleConnectOAuthCallbackHttp

# Wait 2-3 minutes for quota reset

# Deploy next batch
firebase deploy --only functions:slackGetPinnedMessages,functions:getSlackConfigStatus
```

## 🔍 Functions to Review for Removal

Based on the errors, these functions are hitting quota limits. Review if they're all needed:

### Potentially Redundant HTTP Functions
Many functions have both callable and HTTP versions. If callable versions are sufficient, consider removing HTTP versions:

- `getTimecardAssignmentsHttp` (has callable version)
- `updateTimecardTemplateHttp` (has callable version)
- `getMySubmissionsHttp` (has callable version)
- `getTimecardUsersHttp` (has callable version)
- `getTimecardTemplatesHttp` (has callable version)
- `getTimecardConfigurationsHttp` (has callable version)
- `getPendingApprovalsHttp` (has callable version)
- `getApprovalHistoryHttp` (has callable version)
- `getDirectReportsHttp` (has callable version)
- `getAllTimecardsHttp` (has callable version)
- `getTimecardAnalyticsHttp` (has callable version)
- `generateTimecardReportHttp` (has callable version)
- `createTimecardTemplateHttp` (has callable version)
- `deleteTimecardTemplateHttp` (has callable version)
- `createTimecardSessionLinkHttp` (has callable version)
- `removeTimecardSessionLinkHttp` (has callable version)
- `getBudgetsHttp` (has callable version)
- `calculateBudgetVarianceHttp` (has callable version)
- `syncTimecardToBudgetHttp` (has callable version)
- `updateCommittedAmountHttp` (has callable version)
- `revertCommittedAmountHttp` (has callable version)
- `aggregateTimecardCostsHttp` (has callable version)

### Functions That May Be Unused
- `discoverCollectionsHttp` - Check if frontend uses this
- `getPublishedCallSheetHttp` - Check if still needed
- `authenticateTeamMemberHttp` - Check if still needed
- `cleanupExpiredCallSheets` - May be redundant if scheduled
- `getProjectTeamMembers` - Check usage

## 📊 Check Current Function Count

```bash
# List all deployed functions
firebase functions:list

# Count functions
firebase functions:list | wc -l
```

## 🎯 Recommended Action Plan

1. **Delete orphaned function** (5 min)
   ```bash
   firebase functions:delete removeParticipantHttp --region us-central1 --force
   ```

2. **Audit HTTP functions** (30 min)
   - Check which HTTP functions are actually called from frontend
   - Remove HTTP versions if callable versions are sufficient

3. **Request quota increase** (if needed)
   - Go to GCP Console → IAM & Admin → Quotas
   - Request increase for "Cloud Run API - CPU per region"

4. **Deploy in batches** (ongoing)
   - Deploy 10-15 functions at a time
   - Wait 2-3 minutes between batches

5. **Monitor CPU usage**
   ```bash
   # Check Cloud Run services
   gcloud run services list --region us-central1
   ```

## ⚠️ Important Notes

- **CPU quota is per region** - Functions in `us-central1` share the same quota
- **Each function revision consumes CPU** - Old revisions should be cleaned up
- **Min instances consume CPU** - Review `minInstanceCount` settings
- **HTTP functions are public by default** - Consider security implications

## 🔗 Resources

- [Cloud Run Quotas](https://cloud.google.com/run/quotas)
- [Firebase Functions Quotas](https://firebase.google.com/docs/functions/quotas)
- [Request Quota Increase](https://console.cloud.google.com/iam-admin/quotas)

