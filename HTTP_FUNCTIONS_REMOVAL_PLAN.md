# HTTP Functions Removal Plan

## Analysis Results

### ✅ HTTP Functions to KEEP (Actually Used)
These are called from frontend code and must be kept:

1. **OAuth Callback Functions** (Required for OAuth redirects):
   - `boxOAuthCallbackHttp`
   - `dropboxOAuthCallbackHttp`
   - `appleConnectOAuthCallbackHttp`
   - `handleGoogleOAuthCallbackHttp`
   - `slackOAuthCallback` (if HTTP version exists)

2. **OAuth Initiation Functions** (Used in OAuth flows):
   - `initiateGoogleOAuthHttp`
   - `refreshGoogleAccessTokenHttp`

3. **Call Sheet Functions** (Used in PublishedCallSheetLogin):
   - `authenticateTeamMemberHttp`
   - `getPublishedCallSheetHttp`

4. **Box Integration** (Used in BoxService):
   - `uploadToBoxHttp`

5. **FCM Functions** (May be used):
   - `registerFCMTokenHttp`
   - `subscribeToFCMTopicHttp`
   - `unsubscribeFromFCMTopicHttp`

6. **Email Testing** (Used in EmailSettingsService):
   - `testEmailConnectionHttp`

7. **Automation** (Used in automation tests):
   - `executeAutomationHttp`

8. **Other Critical**:
   - `discoverCollectionsHttp` (if used)
   - `getUserInfoHttp` (if used)
   - `migrateCloudIntegrationsHttp` (if used)

### ❌ HTTP Functions to REMOVE (Unused - Callable Versions Exist)

#### Timecard Functions (16 functions - ~16 CPUs freed)
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

#### Budgeting Functions (6 functions - ~6 CPUs freed)
- `getBudgetsHttp` → Use `getBudgets`
- `calculateBudgetVarianceHttp` → Use `calculateBudgetVariance`
- `syncTimecardToBudgetHttp` → Use `syncTimecardToBudget`
- `updateCommittedAmountHttp` → Use `updateCommittedAmount` (if callable exists)
- `revertCommittedAmountHttp` → Use `revertCommittedAmount` (if callable exists)
- `aggregateTimecardCostsHttp` → Use `aggregateTimecardCosts`

#### Messaging Functions (9 functions - ~9 CPUs freed)
- `getMessageSessionsHttp` → Use `getMessageSessions`
- `createMessageSessionHttp` → Use `createMessageSession`
- `sendMessageHttp` → Use `sendMessage`
- `getMessagesHttp` → Use `getMessages`
- `markMessagesAsReadHttp` → Use `markMessagesAsRead`
- `deleteMessageHttp` → Use `deleteMessage`
- `getParticipantsHttp` → Use `getParticipants`
- `addParticipantHttp` → Use `addParticipant`
- `updateMessageSessionHttp` → Use `updateMessageSession`

#### AI Agent Functions (3 functions - ~3 CPUs freed)
- `callAIAgentHttp` → Use `callAIAgent`
- `getAIAgentHealthHttp` → Use `getAIAgentHealth`
- `getUserPreferencesHttp` → Use `getUserPreferences`

#### WebRTC Functions (1 function - ~1 CPU freed)
- `getTURNCredentialsHttp` → Use `getTURNCredentials`

## Total Impact

**Functions to Remove**: ~35 HTTP functions
**Estimated CPU Freed**: ~35 CPUs (assuming 1 CPU per function)
**Risk Level**: Low (callable versions exist and are being used)

## Removal Steps

1. Remove function definitions from source files
2. Remove exports from module index files
3. Remove exports from main index.ts
4. Test that callable versions still work
5. Deploy and verify functions are removed from Firebase

