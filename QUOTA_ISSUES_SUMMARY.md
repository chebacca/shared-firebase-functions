# 🔴 Quota Issues Summary & Action Plan

## Current Status

### Issues Identified:
1. ✅ **`removeParticipantHttp`** - Removed from code but still deployed (needs deletion)
2. ⚠️ **CPU Quota Exceeded** - Too many Cloud Run services
3. ⚠️ **Mutation Quota** - Too many function updates per minute

## 🎯 Immediate Actions Required

### 1. Delete Orphaned Function (5 minutes)

```bash
cd shared-firebase-functions
firebase functions:delete removeParticipantHttp --region us-central1 --force
```

**Note**: Even though we removed it from code, it's still deployed in Firebase and consuming resources.

### 2. Check Current Function Count

```bash
# See how many functions you have
firebase functions:list --region us-central1 | wc -l

# List all functions
firebase functions:list --region us-central1
```

## 📊 CPU Quota Analysis

### The Problem
- **Error**: "Quota exceeded for total allowable CPU per project per region"
- **Default Quota**: Usually 1000 CPUs per region for Cloud Run
- **Your Situation**: You have 100+ functions, each potentially using 1-2 CPUs
- **Math**: 100 functions × 1 CPU = 100 CPUs (but with min instances, could be much higher)

### Solutions (Choose One or More)

#### Option A: Request Quota Increase (Recommended)
1. Go to: https://console.cloud.google.com/iam-admin/quotas
2. Filter: "Cloud Run API" → "CPU per region" → "us-central1"
3. Click "Edit Quotas" → Request increase to 2000-5000 CPUs
4. Usually approved within 24-48 hours

#### Option B: Reduce CPU Allocation
Review functions with high CPU settings:
```bash
# Check functions with high CPU
grep -r "availableCpu" shared-firebase-functions/src/
```

Functions using more than 1 CPU should be reviewed.

#### Option C: Remove Redundant HTTP Functions
Many functions have both callable and HTTP versions. If callable versions are sufficient, remove HTTP versions.

**Functions to Consider Removing** (if callable versions are used):
- All `*Http` timecard functions (if callable versions exist)
- All `*Http` messaging functions (if callable versions exist)
- All `*Http` budgeting functions (if callable versions exist)

## 🔍 Functions That May Be Redundant

Based on codebase analysis, these HTTP functions may be redundant:

### Timecard Functions (20+ HTTP functions)
- `getTimecardTemplatesHttp` → Use `getTimecardTemplates`
- `createTimecardTemplateHttp` → Use `createTimecardTemplate`
- `updateTimecardTemplateHttp` → Use `updateTimecardTemplate`
- `deleteTimecardTemplateHttp` → Use `deleteTimecardTemplate`
- `getTimecardAssignmentsHttp` → Use `getTimecardAssignments`
- `getTimecardUsersHttp` → Use `getTimecardUsers`
- `getTimecardConfigurationsHttp` → Use `getTimecardConfigurations`
- `getPendingApprovalsHttp` → Use `getPendingApprovals`
- `getApprovalHistoryHttp` → Use `getApprovalHistory`
- `getDirectReportsHttp` → Use `getDirectReports`
- `getAllTimecardsHttp` → Use `getAllTimecards`
- `getTimecardAnalyticsHttp` → Use `getTimecardAnalytics`
- `generateTimecardReportHttp` → Use `generateTimecardReport`
- `createTimecardSessionLinkHttp` → Use `createTimecardSessionLink`
- `removeTimecardSessionLinkHttp` → Use `removeTimecardSessionLink`
- `getMySubmissionsHttp` → Use `getMySubmissions`

### Budgeting Functions (5 HTTP functions)
- `getBudgetsHttp` → Use `getBudgets`
- `calculateBudgetVarianceHttp` → Use `calculateBudgetVariance`
- `syncTimecardToBudgetHttp` → Use `syncTimecardToBudget`
- `updateCommittedAmountHttp` → Use `updateCommittedAmount`
- `revertCommittedAmountHttp` → Use `revertCommittedAmount`
- `aggregateTimecardCostsHttp` → Use `aggregateTimecardCosts`

### Messaging Functions (Already Removed One)
- ✅ `removeParticipantHttp` - **ALREADY REMOVED FROM CODE**
- Consider: `addParticipantHttp`, `getMessagesHttp`, etc. if callable versions are used

## 🚀 Deployment Strategy

### Deploy in Smaller Batches

Instead of deploying all functions at once:

```bash
# Batch 1: Critical OAuth functions
firebase deploy --only functions:appleConnectOAuthCallbackHttp,functions:googleOAuthInitiate,functions:googleOAuthCallback

# Wait 2-3 minutes

# Batch 2: Slack functions
firebase deploy --only functions:slackGetPinnedMessages,functions:getSlackConfigStatus,functions:slackOpenDM

# Wait 2-3 minutes

# Continue with other batches...
```

### Use Deployment Scripts

Create a script to deploy in batches:
```bash
#!/bin/bash
# deploy-batches.sh

BATCHES=(
  "appleConnectOAuthCallbackHttp,googleOAuthInitiate,googleOAuthCallback"
  "slackGetPinnedMessages,getSlackConfigStatus,slackOpenDM"
  "slackSendMessage,slackGetUserPresence"
  # ... more batches
)

for batch in "${BATCHES[@]}"; do
  echo "Deploying batch: $batch"
  firebase deploy --only functions:$batch
  echo "Waiting 3 minutes for quota reset..."
  sleep 180
done
```

## 📋 Action Checklist

- [ ] Delete `removeParticipantHttp` from Firebase
- [ ] Check current function count
- [ ] Request CPU quota increase (if needed)
- [ ] Audit which HTTP functions are actually used
- [ ] Remove unused HTTP functions (if callable versions are sufficient)
- [ ] Deploy in smaller batches going forward
- [ ] Monitor CPU usage in GCP Console

## 🔗 Resources

- [Cloud Run Quotas](https://cloud.google.com/run/quotas)
- [Request Quota Increase](https://console.cloud.google.com/iam-admin/quotas)
- [Firebase Functions Deployment](https://firebase.google.com/docs/functions/manage-functions)

## ⚠️ Important Notes

1. **Don't delete functions without checking usage** - Some HTTP functions may be called from external systems
2. **CPU quota is shared** - All functions in `us-central1` share the same quota
3. **Min instances consume CPU** - Review `minInstanceCount` settings
4. **Old revisions consume resources** - Clean up old Cloud Run revisions periodically

