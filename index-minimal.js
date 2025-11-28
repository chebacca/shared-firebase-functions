/**
 * Minimal Google Drive Organization Functions Index
 * Only exports the functions needed for organization-wide Google Drive integration
 */

const { initializeApp } = require('firebase-admin/app');
const functions = require('firebase-functions');

// Initialize Firebase Admin
initializeApp();

// Import only the functions we need
const {
  handleGoogleOAuthCallback,
  indexGoogleDriveFolder,
  getGoogleIntegrationStatus
} = require('./lib/integrations/googleDrive');

// Export only the functions we need
exports.handleGoogleOAuthCallback = handleGoogleOAuthCallback;
exports.indexGoogleDriveFolder = indexGoogleDriveFolder;
exports.getGoogleIntegrationStatus = getGoogleIntegrationStatus;
