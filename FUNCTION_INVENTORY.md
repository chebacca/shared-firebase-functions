# Firebase Functions Inventory

Generated: $(date)

## Overview

Complete inventory of all Firebase Functions in the BACKBONE ecosystem, organized by category.

## Function Categories

### Authentication Functions
- `refreshAuthClaims` - Refresh user authentication claims
- `onUserLoginTrigger` - Trigger on user login
- `getUserInfo` / `getUserInfoHttp` - Get user information
- `findUserByEmail` - Find user by email
- `ensureUserDocument` - Ensure user document exists
- `updateUserClaims` - Update user custom claims
- `syncUserData` - Sync user data
- `validateLicense` - Validate user license
- `grantAppAccess` - Grant app access
- `getUserOrganization` - Get user's organization
- `updateUserOrganization` - Update user's organization
- `getUserProjects` - Get user's projects

### OAuth Functions

**Box:**
- `boxOAuthInitiate` / `boxOAuthInitiateHttp` - Initiate Box OAuth
- `boxOAuthRefresh` - Refresh Box OAuth token
- `boxOAuthCallback` / `boxOAuthCallbackHttp` - Box OAuth callback
- `boxRevokeAccess` - Revoke Box access
- `getBoxAccessToken` - Get Box access token
- `getBoxIntegrationStatus` - Get Box integration status
- `saveBoxConfig` - Save Box configuration
- `uploadToBoxHttp` - Upload file to Box (HTTP)

**Dropbox:**
- `dropboxOAuthInitiate` / `dropboxOAuthInitiateHttp` - Initiate Dropbox OAuth
- `dropboxOAuthRefresh` - Refresh Dropbox OAuth token
- `dropboxOAuthCallback` / `dropboxOAuthCallbackHttp` - Dropbox OAuth callback
- `dropboxRevokeAccess` - Revoke Dropbox access
- `getDropboxAccessToken` - Get Dropbox access token
- `getDropboxIntegrationStatus` - Get Dropbox integration status
- `saveDropboxConfig` - Save Dropbox configuration

**Google:**
- `googleOAuthInitiate` - Initiate Google OAuth
- `initiateGoogleOAuthHttp` - Initiate Google OAuth (HTTP)
- `handleGoogleOAuthCallbackHttp` - Handle Google OAuth callback (HTTP)
- `googleOAuthCallback` - Google OAuth callback
- `googleOAuthRefresh` - Refresh Google OAuth token
- `refreshGoogleAccessTokenHttp` - Refresh Google access token (HTTP)
- `refreshGoogleAccessTokenCallable` - Refresh Google access token (Callable)
- `googleRevokeAccess` - Revoke Google access
- `getGoogleConfigStatus` - Get Google configuration status
- `saveGoogleConfig` - Save Google configuration
- `getGoogleIntegrationStatus` - Get Google integration status
- `indexGoogleDriveFolder` - Index Google Drive folder
- `listGoogleDriveFolders` - List Google Drive folders
- `getGoogleDriveFiles` - Get Google Drive files
- `createGoogleDriveFolder` - Create Google Drive folder
- `uploadToGoogleDrive` - Upload to Google Drive
- `deleteGoogleDriveFile` - Delete Google Drive file
- `downloadGoogleDriveFile` - Download Google Drive file

**Apple Connect:**
- `appleConnectOAuthInitiate` - Initiate Apple Connect OAuth
- `appleConnectOAuthCallback` / `appleConnectOAuthCallbackHttp` - Apple Connect OAuth callback
- `appleConnectRevokeAccess` - Revoke Apple Connect access
- `getAppleConnectConfigStatus` - Get Apple Connect configuration status
- `appleConnectSyncDirectory` - Sync Apple Connect directory
- `appleConnectGetDevices` - Get Apple Connect devices
- `appleConnectGetFiles` - Get Apple Connect files

**Slack:**
- `slackOAuthInitiate` - Initiate Slack OAuth
- `slackOAuthCallback` - Slack OAuth callback
- `slackOAuthRefresh` - Refresh Slack OAuth token
- `slackRevokeAccess` - Revoke Slack access
- `getSlackConfigStatus` - Get Slack configuration status
- `saveSlackConfig` - Save Slack configuration
- `slackSendMessage` - Send Slack message
- `slackGetChannelHistory` - Get Slack channel history
- `slackListChannels` - List Slack channels
- `slackGetUsers` - Get Slack users
- `slackGetPinnedMessages` - Get Slack pinned messages
- `slackPinMessage` - Pin Slack message
- `slackUnpinMessage` - Unpin Slack message
- `slackAddReaction` - Add Slack reaction
- `slackRemoveReaction` - Remove Slack reaction
- `slackDeleteMessage` - Delete Slack message
- `slackUpdateMessage` - Update Slack message
- `slackGetFileInfo` - Get Slack file info
- `slackGetFileList` - Get Slack file list
- `slackUploadFile` - Upload file to Slack
- `slackGetThreadReplies` - Get Slack thread replies
- `slackGetChannelInfo` - Get Slack channel info
- `slackGetUserPresence` - Get Slack user presence
- `slackOpenDM` - Open Slack DM
- `slackScheduleMessage` - Schedule Slack message
- `slackSetReminder` - Set Slack reminder
- `slackSetTyping` - Set Slack typing indicator
- `slackSearchMessages` - Search Slack messages
- `slackGetWorkspaceInfo` - Get Slack workspace info
- `slackWebhookHandler` - Handle Slack webhooks
- `disconnectSlackWorkspaces` - Disconnect Slack workspaces

**Webex:**
- `webexOAuthInitiate` - Initiate Webex OAuth
- `webexOAuthCallback` - Webex OAuth callback
- `webexOAuthRefresh` - Refresh Webex OAuth token
- `webexOAuthRevoke` - Revoke Webex access
- `getWebexConfigStatus` - Get Webex configuration status
- `saveWebexConfig` - Save Webex configuration
- `getWebexMeetingDetails` - Get Webex meeting details

### Video Conferencing Functions
- `getVideoConferencingProviders` - Get available video conferencing providers
- `createMeetMeeting` - Create Google Meet meeting
- `scheduleMeetMeeting` - Schedule Google Meet meeting
- `updateMeetMeeting` - Update Google Meet meeting
- `cancelMeetMeeting` - Cancel Google Meet meeting
- `getMeetMeetingDetails` - Get Google Meet meeting details
- `createWebexMeeting` - Create Webex meeting
- `scheduleWebexMeeting` - Schedule Webex meeting
- `updateWebexMeeting` - Update Webex meeting
- `cancelWebexMeeting` - Cancel Webex meeting

### Timecard Functions

**Templates:**
- `getTimecardTemplates` - Get timecard templates
- `createTimecardTemplate` - Create timecard template
- `updateTimecardTemplate` - Update timecard template
- `deleteTimecardTemplate` - Delete timecard template

**Assignments:**
- `getTimecardAssignments` - Get timecard assignments
- `createTimecardAssignment` - Create timecard assignment
- `updateTimecardAssignment` - Update timecard assignment
- `deleteTimecardAssignment` - Delete timecard assignment

**Entries:**
- `getAllTimecards` - Get all timecards
- `getTimecardUsers` - Get timecard users
- `getTimecardConfigurations` - Get timecard configurations
- `getTimecardAnalytics` - Get timecard analytics
- `generateTimecardReport` - Generate timecard report
- `getWeeklySummary` - Get weekly timecard summary

**Approvals:**
- `getPendingApprovals` - Get pending approvals
- `getMySubmissions` - Get my submissions
- `getApprovalHistory` - Get approval history
- `takeApprovalAction` - Take approval action (approve/reject/escalate)
- `getTimecardHistory` - Get timecard approval history
- `bulkApproveTimecards` - Bulk approve timecards
- `timecardApprovalApi` - Timecard approval API (HTTP)

**Direct Reports:**
- `getDirectReports` - Get direct reports (filtered by manager)
- `getAllDirectReports` - Get all direct reports
- `createDirectReport` - Create direct report relationship
- `updateDirectReport` - Update direct report relationship
- `deactivateDirectReport` - Deactivate direct report relationship

**Session Links:**
- `createTimecardSessionLink` - Create timecard session link
- `removeTimecardSessionLink` - Remove timecard session link

**Triggers:**
- `onTimecardStatusChange` - Trigger on timecard status change

### Budgeting Functions
- `getBudgets` - Get budgets
- `calculateBudgetVariance` - Calculate budget variance
- `syncTimecardToBudget` - Sync timecard to budget
- `aggregateTimecardCosts` - Aggregate timecard costs

### Messaging Functions
- `getMessageSessions` - Get message sessions
- `createMessageSession` - Create message session
- `sendMessage` - Send message
- `getMessages` - Get messages
- `markMessagesAsRead` - Mark messages as read
- `deleteMessage` - Delete message
- `getParticipants` - Get session participants
- `addParticipant` - Add participant to session
- `removeParticipant` - Remove participant from session
- `updateMessageSession` - Update message session

### AI Agent Functions
- `callAIAgent` - Call AI agent
- `getAIAgentHealth` - Get AI agent health status
- `getUserPreferences` - Get user AI preferences
- `storeAIApiKey` - Store AI API key
- `testAIApiKey` - Test AI API key
- `executeAIAction` - Execute AI action
- `triggerAlertGeneration` - Trigger alert generation
- `aiChatAssistant` - AI chat assistant
- `aiAutomationSuggestions` - AI automation suggestions
- `aiWorkflowAnalysis` - AI workflow analysis
- `aiPredictiveAutomation` - AI predictive automation

### ML/Search Functions
- `semanticSearch` - Semantic search
- `searchAll` - Search all collections
- `findSimilar` - Find similar documents
- `indexEntity` - Index entity
- `parseNetworkBible` - Parse network bible
- `extractBudgetData` - Extract budget data
- `parseScript` - Parse script
- `predictBudgetHealth` - Predict budget health
- `forecastSpending` - Forecast spending
- `predictAvailability` - Predict availability
- `batchIndexCollection` - Batch index collection
- `getIndexingStatus` - Get indexing status

### Call Sheet Functions
- `publishCallSheet` / `publishCallSheetCallable` - Publish call sheet
- `disablePublishedCallSheet` / `disablePublishedCallSheetCallable` - Disable published call sheet
- `getPublishedCallSheet` / `getPublishedCallSheetHttp` - Get published call sheet
- `getPublishedCallSheets` - Get all published call sheets
- `authenticateTeamMember` / `authenticateTeamMemberHttp` - Authenticate team member
- `cleanupExpiredCallSheets` - Cleanup expired call sheets
- `updateCallSheetAccessCode` - Update call sheet access code
- `qrScanCheckInOut` / `qrScanCheckInOutHttp` - QR scan check in/out

### FCM Functions
- `registerFCMToken` / `registerFCMTokenHttp` - Register FCM token
- `subscribeToFCMTopic` / `subscribeToFCMTopicHttp` - Subscribe to FCM topic
- `unsubscribeFromFCMTopic` / `unsubscribeFromFCMTopicHttp` - Unsubscribe from FCM topic

### Notification Functions
- `getNotifications` - Get notifications
- `getUnreadNotifications` - Get unread notifications
- `getNotificationsByCategory` - Get notifications by category
- `createNotification` - Create notification
- `updateNotification` - Update notification
- `markNotificationAsRead` - Mark notification as read
- `markAllNotificationsAsRead` - Mark all notifications as read
- `deleteNotification` - Delete notification
- `clearAllNotifications` - Clear all notifications
- `getNotificationSettings` - Get notification settings
- `updateNotificationSettings` - Update notification settings
- `sendNotificationEmail` - Send notification email
- `testEmailConnection` / `testEmailConnectionHttp` - Test email connection

### Clip Show Pro Functions
- `clipShowProUpdateClaims` - Update Clip Show Pro claims
- `createContactWithAuth` - Create contact with auth
- `sendLicenseEmail` - Send license email
- `extractTranscript` - Extract transcript
- `transcribeAudioBlob` - Transcribe audio blob
- `transcribeVideoBlob` - Transcribe video blob
- `createTranscriptionTask` - Create transcription task
- `processTranscriptionTask` - Process transcription task
- `getTranscriptionTaskStatus` - Get transcription task status
- `searchContacts` - Search contacts
- `cleanupTrashcan` - Cleanup trashcan
- `cleanupTrashcanManual` - Manual cleanup trashcan
- `onPermissionsMatrixUpdate` - Trigger on permissions matrix update
- `executeAutomation` / `executeAutomationHttp` - Execute automation
- `onLicenseWrite` - Trigger on license write

### Page Info Functions
- `getPageInfo` - Get page info
- `listAllPageInfo` - List all page info
- `updatePageInfo` - Update page info
- `createPageInfo` - Create page info

### DocuSign Functions
- `storeDocuSignConfig` - Store DocuSign configuration
- `testDocuSignConnection` - Test DocuSign connection
- `createDocuSignEnvelope` - Create DocuSign envelope
- `getDocuSignEnvelopeStatus` - Get DocuSign envelope status
- `downloadDocuSignEnvelopeDocument` - Download DocuSign envelope document
- `docuSignWebhookHandler` - Handle DocuSign webhooks

### System Functions
- `healthCheck` - Health check
- `discoverCollections` / `discoverCollectionsHttp` - Discover collections
- `getSystemStats` - Get system stats
- `getParticipantDetails` - Get participant details
- `cleanupDuplicateUsers` - Cleanup duplicate users

### Team Management Functions
- `getProjectTeamMembers` / `getProjectTeamMembersCallable` - Get project team members

### Settings Functions
- `getUserSettings` - Get user settings
- `updateUserSettings` - Update user settings

### Web3 Functions
- `web3Api` - Web3 API

### API Functions
- `api` - Main API endpoint
- `uploadNetworkDeliveryBible` - Upload network delivery bible
- `getNetworkDeliveryDeliverables` - Get network delivery deliverables

### App Role Functions
- `appRoleDefinitionsApi` - App role definitions API (HTTP)
- `appRoleDefinitionService` - App role definition service

### Migration Functions
- `migrateCloudIntegrations` / `migrateCloudIntegrationsHttp` - Migrate cloud integrations

## Function Types

### Callable Functions (onCall)
Most functions are callable functions, called via `httpsCallable()` from the frontend.

### HTTP Functions (onRequest)
HTTP functions are kept for:
- OAuth callbacks (required for redirects)
- CORS endpoints (call sheet functions)
- Public endpoints (FCM, email testing, automation)

### Both Types
Some functions have both callable and HTTP versions (HTTP versions removed to reduce CPU quota).

## Organization Scope

All functions are scoped to organizations. Functions verify:
- User authentication
- Organization membership
- Organization ID in requests

## Big Tree Productions

Organization ID: `big-tree-productions`

All functions work with Big Tree Productions organization when:
- User has `organizationId: 'big-tree-productions'` in custom claims
- Organization ID is provided in function calls
- Functions verify organization access

