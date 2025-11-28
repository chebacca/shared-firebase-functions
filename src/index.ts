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

// Export Box OAuth functions (HTTP and callable)
export {
  initiateBoxOAuthHttp,
  handleBoxOAuthCallback,
  getBoxIntegrationStatus,
  getBoxAccessToken,
  listBoxFolders,
  getBoxFiles,
  createBoxFolder,
  indexBoxFolder,
  // uploadToBox, // Temporarily excluded due to GCF gen1 CPU configuration issue
  refreshBoxAccessToken,
  saveBoxConfig,
  boxStream
} from './box';

// Export Dropbox OAuth functions (HTTP and callable)
export {
  initiateDropboxOAuthHttp,
  handleDropboxOAuthCallback,
  getDropboxIntegrationStatus,
  getDropboxAccessToken,
  listDropboxFolders,
  getDropboxFiles,
  createDropboxFolder,
  updateDropboxAccountInfo,
  uploadToDropbox,
  indexDropboxFolder,
  refreshDropboxAccessToken,
  saveDropboxConfig,
  setDropboxAccessToken,
  testDropboxConfig
} from './dropbox';

// Export Google Drive OAuth functions (HTTP and callable)
export {
  initiateGoogleOAuth,
  initiateGoogleOAuthHttp, // HTTP version with CORS support for localhost
  handleGoogleOAuthCallback,
  handleGoogleOAuthCallbackHttp, // HTTP version for frontend callbacks
  refreshGoogleAccessToken,
  refreshGoogleAccessTokenCallable,
  listGoogleDriveFolders,
  getGoogleDriveFiles,
  createGoogleDriveFolder,
  uploadToGoogleDrive,
  getGoogleIntegrationStatus
} from './integrations';

// Export unified user management functions
export {
  getUserInfo,
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
  healthCheck
} from './unified';

// Export Web3 wallet management functions
export {
  web3Api
} from './web3';

// Export AI functions
export * from './ai';

// Export main API function
export { api } from './api';

// Export timecard functions
export {
  getTimecardTemplates,
  getTimecardTemplatesHttp,
  createTimecardTemplate,
  createTimecardTemplateHttp,
  getTimecardAssignments,
  getTimecardAssignmentsHttp,
  getAllTimecards,
  getAllTimecardsHttp,
  getTimecardUsers,
  getTimecardUsersHttp,
  getTimecardConfigurations,
  getTimecardConfigurationsHttp,
  timecardApprovalApi
} from './timecards';

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
  cleanupExpiredCallSheets
} from './callSheets';

// Export duplicate user cleanup function
export {
  cleanupDuplicateUsers
} from './system/cleanupDuplicateUsers';

// Export settings functions
export {
  getUserSettings,
  updateUserSettings
} from './settings/userSettings';

// NOTE: Other functions commented out due to TypeScript errors

