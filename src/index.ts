/**
 * MINIMAL AUTOMATION FUNCTIONS EXPORT
 * 
 * Exports only working functions to avoid TypeScript compilation errors
 * Add exports incrementally as needed
 */

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

// Export App Role Definition Service
export { appRoleDefinitionService, AppRoleDefinitionService } from './roles/AppRoleDefinitionService';

// Export App Role Definitions HTTP API
export { appRoleDefinitionsApi } from './roles/appRoleDefinitionsHttp';

// Export Box integration functions (NEW MODULAR STRUCTURE - OAuth & Config)
// OAuth functions: boxOAuthInitiate, boxOAuthRefresh, boxRevokeAccess, boxOAuthCallback
// Config functions: saveBoxConfig, getBoxConfigStatus
export * from './box';

// Export Dropbox integration functions (NEW MODULAR STRUCTURE - OAuth & Config)
// OAuth functions: dropboxOAuthInitiate, dropboxOAuthRefresh, dropboxRevokeAccess, dropboxOAuthCallback
// Config functions: saveDropboxConfig, getDropboxConfigStatus
export * from './dropbox';

// Export Box API functions (LEGACY - still needed for file operations)
// NOTE: OAuth functions (initiateBoxOAuthHttp, handleBoxOAuthCallback, saveBoxConfig) 
// have been migrated to the new modular structure above. These are kept for backward compatibility
// but should use the new functions: boxOAuthInitiate, boxOAuthCallback, saveBoxConfig (from box/config.ts)
export {
  // DEPRECATED OAuth functions - use boxOAuthInitiate, boxOAuthCallback from './box' instead
  // initiateBoxOAuthHttp,  // DEPRECATED - use boxOAuthInitiate from './box'
  // handleBoxOAuthCallback, // DEPRECATED - use boxOAuthCallback from './box'
  // saveBoxConfig,          // DEPRECATED - use saveBoxConfig from './box/config'

  // API functions (still active)
  getBoxIntegrationStatus,
  getBoxAccessToken,
  listBoxFolders,
  getBoxFiles,
  createBoxFolder,
  indexBoxFolder,
  // uploadToBox, // Temporarily disabled due to GCF gen1 CPU configuration issue
  uploadToBoxHttp,
  refreshBoxAccessToken,
  boxStream
} from './box';

// Export Dropbox API functions (LEGACY - still needed for file operations)
// NOTE: OAuth functions (initiateDropboxOAuthHttp, handleDropboxOAuthCallback, saveDropboxConfig)
// have been migrated to the new modular structure above. These are kept for backward compatibility
// but should use the new functions: dropboxOAuthInitiate, dropboxOAuthCallback, saveDropboxConfig (from dropbox/config.ts)
export {
  // DEPRECATED OAuth functions - use dropboxOAuthInitiate, dropboxOAuthCallback from './dropbox' instead
  // initiateDropboxOAuthHttp,  // DEPRECATED - use dropboxOAuthInitiate from './dropbox'
  // handleDropboxOAuthCallback, // DEPRECATED - use dropboxOAuthCallback from './dropbox'
  // saveDropboxConfig,          // DEPRECATED - use saveDropboxConfig from './dropbox/config'

  // API functions (still active)
  getDropboxIntegrationStatus,
  getDropboxAccessToken,
  listDropboxFolders,
  getDropboxFiles,
  createDropboxFolder,
  updateDropboxAccountInfo,
  uploadToDropbox,
  indexDropboxFolder,
  refreshDropboxAccessToken,
  setDropboxAccessToken,
  testDropboxConfig
} from './dropbox';

// Export Google Drive OAuth functions (HTTP only - simplified)
export {
  initiateGoogleOAuthHttp, // HTTP version with CORS support for localhost
  handleGoogleOAuthCallbackHttp, // HTTP version for frontend callbacks
  refreshGoogleAccessTokenHttp, // HTTP version for token refresh
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
  onUserLoginTrigger
} from './auth';

// Export Web3 wallet management functions
export {
  web3Api
} from './web3';

// Export AI functions
export * from './ai';

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

// Export timecard functions
export {
  getTimecardTemplates,
  getTimecardTemplatesHttp,
  createTimecardTemplate,
  createTimecardTemplateHttp,
  updateTimecardTemplate,
  updateTimecardTemplateHttp,
  deleteTimecardTemplate,
  deleteTimecardTemplateHttp,
  getTimecardAssignments,
  getTimecardAssignmentsHttp,
  getTimecardAnalytics,
  getTimecardAnalyticsHttp,
  generateTimecardReport,
  generateTimecardReportHttp,
  createTimecardSessionLink,
  createTimecardSessionLinkHttp,
  removeTimecardSessionLink,
  removeTimecardSessionLinkHttp,
  getAllTimecards,
  getAllTimecardsHttp,
  getTimecardUsers,
  getTimecardUsersHttp,
  getTimecardConfigurations,
  getTimecardConfigurationsHttp,
  getPendingApprovals,
  getPendingApprovalsHttp,
  getMySubmissions,
  getMySubmissionsHttp,
  getApprovalHistory,
  getApprovalHistoryHttp,
  getDirectReports,
  getDirectReportsHttp,
  timecardApprovalApi,
  onTimecardStatusChange
} from './timecards';

// Export budgeting functions
export {
  getBudgets,
  getBudgetsHttp,
  calculateBudgetVariance,
  calculateBudgetVarianceHttp,
  syncTimecardToBudget,
  syncTimecardToBudgetHttp,
  updateCommittedAmountHttp,
  revertCommittedAmountHttp,
  aggregateTimecardCosts,
  aggregateTimecardCostsHttp
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

// Export messaging functions
export {
  getMessageSessions,
  getMessageSessionsHttp,
  createMessageSession,
  createMessageSessionHttp,
  sendMessage,
  sendMessageHttp,
  getMessages,
  getMessagesHttp,
  markMessagesAsRead,
  markMessagesAsReadHttp,
  deleteMessage,
  deleteMessageHttp,
  getParticipants,
  getParticipantsHttp,
  addParticipant,
  addParticipantHttp,
  removeParticipant,
  removeParticipantHttp,
  updateMessageSession,
  updateMessageSessionHttp
} from './messaging';

// Export AI agent functions
export {
  callAIAgent,
  callAIAgentHttp,
  getAIAgentHealth,
  getAIAgentHealthHttp,
  getUserPreferences,
  getUserPreferencesHttp
} from './aiAgent';

// Export WebRTC functions
export {
  getTURNCredentials,
  getTURNCredentialsHttp
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

// NOTE: Other functions commented out due to TypeScript errors

