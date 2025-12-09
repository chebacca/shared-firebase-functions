
/**
 * Minimal Functions Index
 * Exports Google Drive integration and automation functions
 */

import { initializeApp } from 'firebase-admin/app';
import * as functions from 'firebase-functions';

// Initialize Firebase Admin
initializeApp();

// Import Google Drive functions
import {
  handleGoogleOAuthCallbackHttp,
  indexGoogleDriveFolder,
  getGoogleIntegrationStatus
} from './integrations/googleDrive';

// Import automation functions
import {
  sendNotificationEmail,
  testEmailConnection
} from './notifications/sendEmail';

import {
  executeAutomation
} from './clipShowPro/automationExecutor';

// Import Box OAuth HTTP function
import {
  initiateBoxOAuthHttp
} from './box';

// Export all functions
export {
  // Google Drive
  handleGoogleOAuthCallbackHttp,
  indexGoogleDriveFolder,
  getGoogleIntegrationStatus,
  // Automation
  sendNotificationEmail,
  testEmailConnection,
  executeAutomation,
  // Box OAuth
  initiateBoxOAuthHttp
};
