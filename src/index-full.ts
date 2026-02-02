/**
 * 🔥 SHARED FIREBASE FUNCTIONS INDEX
 * Entry point for all shared Firebase Functions
 * 
 * TEMPORARY: Only exporting Google Drive functions for deployment
 */

// Export auth functions
export * from './auth/login';
export * from './auth/verify';
// export * from './auth/updateUserActivity';
// export * from './auth/migrateLastActive';

// Export unified functions
export * from './unified/index';

// Export inventory functions
export * from './inventory/schemas';
export * from './inventory/networkIP';
export * from './inventory/networks';

// Export settings functions
export * from './settings/userSettings.js';

// Export accounting approval functions
export * from './accounting/index';

// Export timecards functions
// export * from './timecards/index';
// export { timecardApprovalApi } from './timecards/timecardApprovalApi';

// Export Clip Show Pro functions
// export * from './clipShowPro/index'; // Temporarily disabled to avoid deployment conflicts

// Export cloud integration functions - Google Drive only
export {
  initiateGoogleOAuthHttp,
  handleGoogleOAuthCallbackHttp,
  refreshGoogleAccessToken,
  listGoogleDriveFolders,
  getGoogleDriveFiles,
  createGoogleDriveFolder,
  uploadToGoogleDrive,
  getGoogleIntegrationStatus
} from './integrations/googleDrive';

// Export Google Drive HTTP functions for CORS support (now in googleDrive.ts)
// export {
//   initiateGoogleOAuthHttp,
//   handleGoogleOAuthCallbackHttp,
//   getGoogleIntegrationStatusHttp,
//   listGoogleDriveFoldersHttp,
//   getGoogleDriveFilesHttp,
//   createGoogleDriveFolderHttp,
//   uploadToGoogleDriveHttp
// } from './integrations/googleDriveHttp';