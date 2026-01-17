/**
 * MINIMAL AUTOMATION FUNCTIONS EXPORT
 * 
 * Exports only working functions to avoid TypeScript compilation errors
 * Add exports incrementally as needed
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Initialize telemetry before any other code
import { initializeTelemetry } from './observability/telemetry';
// Sentry is optional - uncomment to enable when needed
// Reports
export * from './reports/reportFunctions';
// import { initializeSentry } from './observability/sentry';

// Initialize observability stack (Google Cloud Monitoring via OpenTelemetry)
initializeTelemetry();
// Sentry is disabled by default - uncomment to enable when needed
// initializeSentry();

// Export email notification functions (both callable and HTTP)
export {
  sendNotificationEmail,
  testEmailConnection,
  testEmailConnectionHttp
} from './notifications/sendEmail';

// Export notification CRUD functions
export {
  getNotifications,
  getUnreadNotifications,
  getNotificationsByCategory,
  createNotification,
  updateNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getNotificationSettings,
  updateNotificationSettings
} from './notifications/crud';

// Export automation executor  
export {
  executeAutomation,
  executeAutomationHttp
} from './clipShowPro/automationExecutor';

// Export contact creation with auth
export {
  createContactWithAuth
} from './clipShowPro/createContactWithAuth';

// Export Clip Show Pro claims management
export {
  clipShowProUpdateClaims
} from './clipShowPro/clipShowProUpdateClaims';

// Export IWM claims management
export {
  iwmUpdateClaims
} from './iwm/iwmUpdateClaims';

// Export license email function
export {
  sendLicenseEmail
} from './clipShowPro/sendLicenseEmail';

// Export license sync trigger
export {
  onLicenseWrite
} from './licensing';

// Export transcript extraction function
export {
  extractTranscript
} from './clipShowPro/extractTranscript';

// Export video blob transcription function
export {
  transcribeVideoBlob
} from './clipShowPro/transcribeVideoBlob';

// Export audio blob transcription function
export {
  transcribeAudioBlob
} from './clipShowPro/transcribeAudioBlob';

// Export async transcription functions
export {
  createTranscriptionTask,
  processTranscriptionTask,
  getTranscriptionTaskStatus
} from './clipShowPro/transcribeVideoBlobAsync';

// Export comprehensive contact search function
export {
  searchContacts
} from './clipShowPro/searchContacts';

// Export trashcan cleanup functions
export {
  cleanupTrashcan,
  cleanupTrashcanManual
} from './clipShowPro/cleanupTrashcan';

// Export permissions matrix trigger (auto-syncs Permissions Matrix to Firebase Auth claims)
export {
  onPermissionsMatrixUpdate
} from './clipShowPro/permissionsMatrixTrigger';

// Export page info functions
export {
  getPageInfo,
  listAllPageInfo,
  updatePageInfo,
  createPageInfo
} from './functions/pageInfo';

// Export Call Sheet personnel functions
export {
  callsheet_createPersonnelAccount,
  callsheet_changePersonnelPassword,
  callsheet_resetPersonnelPassword
} from './callsheet';

// Export Slack integration functions
export * from './slack';

// Export Google Drive integration functions
export * from './google';

// Export Apple Connect integration functions
export * from './apple';

// Export Webex integration functions
export * from './webex';

// Export Video Conferencing functions
export * from './videoConferencing';
export * from './location';

// Export Travel Management functions
export {
  sendTravelEmail,
  sendTravelNotification,
  sendTravelReminder
} from './travel';

// Export Production Workflow System functions
export * from './workflow';

// Export App Role Definition Service
export { appRoleDefinitionService, AppRoleDefinitionService } from './roles/AppRoleDefinitionService';

// Export App Role Definitions HTTP API
export { appRoleDefinitionsApi } from './roles/appRoleDefinitionsHttp';

// Export Box integration functions (NEW MODULAR STRUCTURE - OAuth & Config)
// OAuth functions: boxOAuthInitiate, boxOAuthRefresh, boxRevokeAccess, boxOAuthCallback, boxOAuthCallbackHttp
// Config functions: saveBoxConfig, getBoxConfigStatus
export * from './box';
// Explicitly export HTTP callback functions for server-side redirects
export { boxOAuthCallbackHttp, boxOAuthInitiateHttp } from './box/oauth';
export { dropboxOAuthCallbackHttp, dropboxOAuthInitiateHttp } from './dropbox/oauth';

// Export Dropbox integration functions (NEW MODULAR STRUCTURE - OAuth & Config)
// OAuth functions: dropboxOAuthInitiate, dropboxOAuthRefresh, dropboxRevokeAccess, dropboxOAuthCallback
// Config functions: saveDropboxConfig, getDropboxConfigStatus
export * from './dropbox';

// Export Unified OAuth Functions (NEW - Works with ANY provider)
// These replace the provider-specific OAuth functions above
export {
  initiateOAuth,
  handleOAuthCallback,
  refreshOAuthToken,
  revokeOAuthConnection,
  disconnectIntegration,
  listAvailableProviders,
  verifyIntegrationAccess,
  updateOAuthAccountInfo
} from './integrations/unified-oauth/functions';

// Export OAuth token save function
export { saveOAuthTokens } from './integrations/unified-oauth/saveOAuthTokens';

// Export Scheduled OAuth Functions
export {
  refreshExpiredTokens
} from './integrations/unified-oauth/schedules/refreshTokens';
export {
  cleanupExpiredOAuthStates
} from './integrations/unified-oauth/schedules/cleanupStates';

// Export Migration Function
export {
  runOAuthMigration
} from './integrations/unified-oauth/migrations/migrationFunction';



// Export Google Drive OAuth functions (HTTP and Callable)
export {
  initiateGoogleOAuthHttp, // HTTP version with CORS support for localhost
  handleGoogleOAuthCallbackHttp, // HTTP version for frontend callbacks
  refreshGoogleAccessTokenHttp, // HTTP version for token refresh
  refreshGoogleAccessTokenCallable, // Callable version for token refresh (no console errors)
  refreshGoogleAccessToken, // Internal function for token refresh
  listGoogleDriveFolders,
  getGoogleDriveFiles,
  createGoogleDriveFolder,
  uploadToGoogleDrive,
  getGoogleIntegrationStatus
} from './integrations';

// Export unified user management functions
export {
  getUserInfo,
  getUserInfoHttp,
  findUserByEmail,
  ensureUserDocument,
  updateUserClaims,
  syncUserData,
  validateLicense,
  grantAppAccess,
  getUserOrganization,
  updateUserOrganization,
  getUserProjects,
  getUserActiveProjects,
  discoverCollections,
  discoverCollectionsHttp,
  transferAuthToken,
  getSystemStats,
  getParticipantDetails,
  healthCheck
} from './unified';

// Export unified auth functions (refreshAuthClaims for all apps)
export {
  refreshAuthClaims,
  onUserLoginTrigger,
  exchangeHubToken
} from './auth';

// Export Web3 wallet management functions
export {
  web3Api
} from './web3';

// Export AI functions
export * from './ai';
export { createScriptPackage } from './ai/scriptTools';
export { createWorkflow } from './ai/workflowCloudFunctions';
export { executeAIAction } from './ai/executeAIAction';

// Export Clip Show Pro AI and Workflow functions
export {
  generateScript,
  analyzePitchContent,
  notifyPitchStatusChange,
  notifyPitchAssignment,
  notifyLicensingSpecialist,
  getPitchAnalytics,
  clipShowProHealthCheck,
  autoCreateStory,
  syncPitchFromStory,
  onPitchCreated,
  onPitchUpdated,
  onStoryUpdated,
  onClearanceCreated,
  onClearanceUpdated
} from './clipShowPro';

// Export System Alerts
export * from './utils/systemAlerts';

// Export migration functions
export {
  migrateCloudIntegrations,
  migrateCloudIntegrationsHttp
} from './migrations/migrateCloudIntegrations';

// Export main API function
export { api, uploadNetworkDeliveryBible, getNetworkDeliveryDeliverables } from './api';

// Export timecard functions (callable versions only - HTTP versions removed to reduce CPU quota)
export {
  getTimecardTemplates,
  createTimecardTemplate,
  updateTimecardTemplate,
  deleteTimecardTemplate,
  getTimecardAssignments,
  getTimecardAnalytics,
  generateTimecardReport,
  createTimecardSessionLink,
  removeTimecardSessionLink,
  getAllTimecards,
  getTimecardUsers,
  getTimecardConfigurations,
  createTimecardConfiguration,
  updateTimecardConfiguration,
  deleteTimecardConfiguration,
  getPendingApprovals,
  getMySubmissions,
  getApprovalHistory,
  getDirectReports,
  timecardApprovalApi,
  onTimecardStatusChange,
  // Approval functions
  takeApprovalAction,
  getTimecardHistory,
  submitTimecardForApproval,
  // Direct report functions
  getAllDirectReports,
  createDirectReport,
  updateDirectReport,
  deactivateDirectReport,
  // Assignment functions
  createTimecardAssignment,
  updateTimecardAssignment,
  deleteTimecardAssignment,
  // Utility functions
  getWeeklySummary,
  bulkApproveTimecards,
  // Clock in/out functions
  clockIn,
  clockOut
} from './timecards';

// Export budgeting functions (callable versions only - HTTP versions removed to reduce CPU quota)
export {
  getBudgets,
  calculateBudgetVariance,
  syncTimecardToBudget,
  aggregateTimecardCosts
} from './budgeting';

// Export FCM functions
export {
  registerFCMToken,
  registerFCMTokenHttp,
  subscribeToFCMTopic,
  subscribeToFCMTopicHttp,
  unsubscribeFromFCMTopic,
  unsubscribeFromFCMTopicHttp
} from './fcm';

// Export messaging functions (callable versions only - HTTP versions removed to reduce CPU quota)
export {
  getMessageSessions,
  createMessageSession,
  sendMessage,
  getMessages,
  markMessagesAsRead,
  deleteMessage,
  getParticipants,
  addParticipant,
  removeParticipant,
  updateMessageSession
} from './messaging';

// Export AI agent functions (callable versions only - HTTP versions removed to reduce CPU quota)
export {
  callAIAgent,
  getAIAgentHealth,
  getUserPreferences
} from './aiAgent';

// Export orchestration functions
export {
  executeOrchestrationWorkflow
} from './orchestration/functions';

// Export WebRTC functions (callable version only - HTTP version removed to reduce CPU quota)
export {
  getTURNCredentials
} from './webrtc';

// Export call sheet functions
export {
  publishCallSheet,
  publishCallSheetCallable,
  disablePublishedCallSheet,
  disablePublishedCallSheetCallable,
  getPublishedCallSheet,
  getPublishedCallSheetHttp,  // 🔧 CRITICAL FIX: Export HTTP function for CORS support
  getPublishedCallSheets,
  authenticateTeamMember,
  authenticateTeamMemberHttp,  // 🔧 CRITICAL FIX: Export HTTP function for CORS support
  cleanupExpiredCallSheets,
  updateCallSheetAccessCode  // Temporary function to update access codes
} from './callSheets';

// Export team management functions
export {
  getProjectTeamMembers,
  getProjectTeamMembersCallable
} from './team';

// Export duplicate user cleanup function
export {
  cleanupDuplicateUsers
} from './system/cleanupDuplicateUsers';

// Export settings functions
export {
  getUserSettings,
  updateUserSettings
} from './settings/userSettings';

// Export DocuSign functions
export { storeDocuSignConfig } from './clipShowPro/docusign/storeDocuSignConfig';
export { testDocuSignConnection } from './clipShowPro/docusign/testDocuSignConnection';
export { createDocuSignEnvelope } from './clipShowPro/docusign/createDocuSignEnvelope';
export { getDocuSignEnvelopeStatus } from './clipShowPro/docusign/getDocuSignEnvelopeStatus';
export { downloadDocuSignEnvelopeDocument } from './clipShowPro/docusign/downloadDocuSignEnvelopeDocument';
export { docuSignWebhookHandler } from './clipShowPro/docusign/webhookHandler';

// Export ML Services functions
export {
  semanticSearch,
  searchAll,
  findSimilar,
  indexEntity,
  parseNetworkBible,
  extractBudgetData,
  parseScript,
  predictBudgetHealth,
  forecastSpending,
  predictAvailability,
  batchIndexCollection,
  getIndexingStatus
} from './ml/functions';

// Export migration functions
export {
  migrateBoxTokens,
  migrateDropboxTokens
} from './migrations/migrateLegacyTokens';

// Export project resources functions
export {
  assignContactToProject,
  unassignContactFromProject,
  getProjectContacts,
  checkoutInventoryToProject,
  returnInventoryFromProject,
  getProjectInventory,
  getInventoryAvailability
} from './projectResources';

// Export Security functions
export {
  createGuardWithAuth
} from './security/createGuardWithAuth';

export {
  createGuestProfileFromSecurityDesk,
  createGuestProfileFromSecurityDeskHttp,
  requestGuestApproval,
  requestGuestApprovalHttp,
  getProjectTeamMembersForContact,
  getProjectTeamMembersForContactHttp,
  manualCheckInOut,
  manualCheckInOutHttp,
} from './security';

// Export overtime request functions
export {
  createOvertimeRequest,
  respondToOvertimeRequest,
  certifyOvertimeRequest,
  approveOvertimeRequest,
  rejectOvertimeRequest
} from './overtime';

// NOTE: Other functions commented out due to TypeScript errors

