/**
 * Cloud Integrations Module
 * 
 * Exports all cloud integration functions for Google Drive, Box, and Airtable
 */

// Google Drive functions
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
} from './googleDrive';

// Airtable integration is intentionally disabled (not used).
// Keeping these exports disabled avoids pulling in the `airtable` dependency
// during Firebase Functions analysis/deploy.
//
// If we ever re-enable Airtable, we should also add feature-flagged/lazy imports
// so missing/optional deps don't break deploy-time analysis.

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
