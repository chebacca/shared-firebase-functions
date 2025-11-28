/**
 * Cloud Integrations Module
 * 
 * Exports all cloud integration functions for Google Drive, Box, and Airtable
 */

// Google Drive functions
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
} from './googleDrive';

// Airtable functions
export {
  initiateAirtableOAuth,
  handleAirtableOAuthCallback,
  getAirtableIntegrationStatus,
  handleAirtableWebhook,
  processAirtableWebhookQueue,
  syncAirtableToFirebase,
  syncFirebaseToAirtable,
  importAirtableData,
  exportToAirtable,
  scheduledAirtableSync,
  validateAirtableConnection,
  getAirtableBases,
  getAirtableTables
} from './airtable';

// Airtable sync queue functions
export {
  processAirtableSyncQueue,
  processSyncBatch,
  cleanupSyncQueue
} from './airtableSyncQueue';

// Box functions - TEMPORARILY DISABLED
// export {
//   initiateBoxOAuth,
//   handleBoxOAuthCallback,
//   refreshBoxAccessToken,
//   listBoxFolders,
//   getBoxFiles,
//   createBoxFolder,
//   uploadToBox,
//   getBoxIntegrationStatus
// } from './box';

// Encryption utilities
export {
  encryptTokens,
  decryptTokens,
  generateSecureState,
  verifyState,
  hashForLogging
} from './encryption';
