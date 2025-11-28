/**
 * Google Drive Only Functions
 * Minimal deployment for Google Drive integration
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Export only Google Drive functions
export { 
  initiateGoogleOAuth,
  handleGoogleOAuthCallback,
  refreshGoogleAccessToken,
  listGoogleDriveFolders,
  getGoogleDriveFiles,
  createGoogleDriveFolder,
  uploadToGoogleDrive,
  getGoogleIntegrationStatus
} from './integrations/googleDrive';
