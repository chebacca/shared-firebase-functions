
/**
 * Minimal Google Drive HTTP Functions Index
 * Only exports the HTTP functions needed for CORS support
 */

import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin
initializeApp();

// Import only the HTTP functions we need
import {
  getGoogleIntegrationStatusHttp,
  listGoogleDriveFoldersHttp
} from './integrations/googleDriveHttp';

// Export only HTTP functions
export {
  getGoogleIntegrationStatusHttp,
  listGoogleDriveFoldersHttp
};
