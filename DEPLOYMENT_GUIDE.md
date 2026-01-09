# Firebase Functions Deployment Guide

## Overview

All Firebase Cloud Functions are now centralized in `shared-firebase-functions/` at the repository root. This ensures:
- Single source of truth for all functions
- No duplicate code
- Clear deployment process
- No confusion about which folder contains functions

## Directory Structure

```
shared-firebase-functions/
├── src/
│   ├── shared/              # Shared utilities and services used by all apps
│   ├── workflow/            # Production Workflow System specific functions
│   │   ├── routes/         # Express routes for workflow API
│   │   ├── delivery/       # Delivery package functions
│   │   ├── triggers/       # Firestore triggers
│   │   ├── services/       # Workflow-specific services
│   │   ├── middleware/     # Authentication middleware
│   │   └── utils/         # Workflow utilities
│   ├── timecards/          # Timecard Management System functions
│   │   ├── labor/         # Labor rules functions
│   │   ├── users/         # Extended user functions
│   │   └── scripts/      # Timecard scripts
│   ├── callsheet/          # Standalone Call Sheet functions
│   ├── iwm/               # IWM (Inventory & Workflow Management) functions
│   ├── videoConferencing/ # Video conferencing (Google Meet, Webex)
│   ├── integrations/      # OAuth and integration functions
│   ├── slack/             # Slack integration functions
│   ├── google/            # Google Drive integration functions
│   └── ...                # Other shared functions
├── deploy-shared.sh       # Deploy shared functions only
├── deploy-workflow.sh     # Deploy workflow-specific functions
├── deploy-timecards.sh    # Deploy timecard-specific functions
├── deploy-callsheet.sh    # Deploy callsheet-specific functions
├── deploy-iwm.sh          # Deploy IWM-specific functions
├── deploy-all.sh          # Deploy all functions
└── DEPLOYMENT_GUIDE.md    # This file
```

## Function Ownership

### Shared Functions (Used by All Apps)
- `scheduleMeetMeeting` - Schedule Google Meet meetings
- `createMeetMeeting` - Create Google Meet meetings
- `getVideoConferencingProviders` - Get available video conferencing providers
- `initiateOAuth` - Start OAuth flow for any provider
- `handleOAuthCallback` - Handle OAuth callback
- `refreshOAuthToken` - Refresh OAuth tokens
- `revokeOAuthConnection` - Revoke OAuth connections
- `listAvailableProviders` - List available OAuth providers
- All integration functions (Slack, Google Drive, Box, Dropbox, etc.)

### Production Workflow System Functions
- `sendDeliveryPackageEmail` - Send delivery package emails
- `generateDeliveryPackageZip` - Generate delivery package ZIP files
- `proxyFileDownload` - Proxy file downloads
- `onWorkflowStepUpdate` - Firestore trigger for workflow step updates
- Workflow routes (Express API endpoints)

### Timecard Management System Functions
- `getTimecardTemplates` - Get timecard templates
- `createTimecardTemplate` - Create timecard template
- `updateTimecardTemplate` - Update timecard template
- `deleteTimecardTemplate` - Delete timecard template
- `getAllTimecards` - Get all timecards
- `getTimecardUsers` - Get timecard users
- `getTimecardConfigurations` - Get timecard configurations
- `onTimecardStatusChange` - Firestore trigger for timecard status changes
- `getBudgets` - Get budgets
- `calculateBudgetVariance` - Calculate budget variance
- `syncTimecardToBudget` - Sync timecard to budget
- `aggregateTimecardCosts` - Aggregate timecard costs
- `getLaborRules` - Get labor rules
- `getExtendedUsers` - Get extended user information

### Standalone Call Sheet Functions
- `callsheet_createPersonnelAccount` - Create personnel account
- `callsheet_changePersonnelPassword` - Change personnel password
- `callsheet_resetPersonnelPassword` - Reset personnel password

### IWM Functions
- `iwmUpdateClaims` - Update IWM custom claims

## Deployment Process

### Prerequisites
1. Ensure you're in the `shared-firebase-functions/` directory
2. Ensure Firebase CLI is installed and authenticated
3. Ensure you're using the correct Firebase project

### Deployment Scripts

#### Deploy Shared Functions Only
```bash
cd shared-firebase-functions
./deploy-shared.sh
```
Deploys: videoConferencing, integrations, oauth functions

#### Deploy Production Workflow System Functions
```bash
cd shared-firebase-functions
./deploy-workflow.sh
```
Deploys: shared functions + workflow-specific functions

#### Deploy Timecard Management System Functions
```bash
cd shared-firebase-functions
./deploy-timecards.sh
```
Deploys: shared functions + timecard-specific functions

#### Deploy Standalone Call Sheet Functions
```bash
cd shared-firebase-functions
./deploy-callsheet.sh
```
Deploys: shared functions + callsheet-specific functions

#### Deploy IWM Functions
```bash
cd shared-firebase-functions
./deploy-iwm.sh
```
Deploys: shared functions + IWM-specific functions

#### Deploy All Functions
```bash
cd shared-firebase-functions
./deploy-all.sh
```
Deploys: ALL functions (use for initial setup or major updates)

### Manual Deployment

If you need to deploy specific functions manually:

```bash
cd shared-firebase-functions
firebase deploy --only functions:functionName1,functions:functionName2
```

## App Firebase Configuration

Each app's `firebase.json` now only contains hosting configuration. Functions are NOT configured in app firebase.json files.

Example app firebase.json:
```json
{
  "hosting": {
    "target": "backbone-workflow",
    "public": "apps/web/dist",
    ...
  }
}
```

Functions are deployed from `shared-firebase-functions/firebase.json` only.

## Migration Notes

### What Changed
1. All local `functions/` folders have been removed from apps
2. All functions are now in `shared-firebase-functions/src/`
3. App-specific functions are organized in subfolders:
   - `workflow/` - Production Workflow System
   - `timecards/` - Timecard Management System
   - `callsheet/` - Standalone Call Sheet
   - `iwm/` - IWM
4. All app `firebase.json` files no longer have `functions` sections

### What Stayed the Same
- Function names remain the same
- Function behavior remains the same
- Client-side code doesn't need changes (functions are called the same way)

## Troubleshooting

### Function Not Found Error
If you get a "function not found" error:
1. Check that the function is exported in `shared-firebase-functions/src/index.ts`
2. Check that the function is deployed: `firebase functions:list`
3. Redeploy the function using the appropriate deployment script

### Import Errors
If you see import errors in workflow functions:
- Check that import paths are relative to the new location
- Workflow functions should import from `../utils/environment` (not `../../utils/environment`)
- Workflow middleware should import from `../services/dynamicRoleService` (not `../../services/dynamicRoleService`)

### Deployment Errors
If deployment fails:
1. Check that you're in the `shared-firebase-functions/` directory
2. Check that Firebase CLI is authenticated: `firebase login`
3. Check that the correct project is selected: `firebase use`
4. Check TypeScript compilation: `cd shared-firebase-functions && npm run build`

## Best Practices

1. **Always deploy from `shared-firebase-functions/` directory**
2. **Use deployment scripts** for clarity and consistency
3. **Deploy shared functions first** when setting up a new environment
4. **Test functions locally** using Firebase emulators before deploying
5. **Keep function names consistent** - don't rename functions without updating clients

## Support

For issues or questions:
1. Check this guide first
2. Review function exports in `shared-firebase-functions/src/index.ts`
3. Check Firebase Functions logs: `firebase functions:log`
