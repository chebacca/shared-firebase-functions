#!/usr/bin/env node

/**
 * Deploy only Google Drive HTTP functions
 * This script creates a minimal index file with only the HTTP functions we need
 */

const fs = require('fs');
const path = require('path');

console.log('🔥 Creating minimal index file for Google Drive HTTP functions...');

// Create a minimal index file with only the HTTP functions
const minimalIndex = `
/**
 * Minimal Google Drive HTTP Functions Index
 * Only exports the HTTP functions needed for CORS support
 */

import { initializeApp } from 'firebase-admin/app';
import * as functions from 'firebase-functions';

// Initialize Firebase Admin
initializeApp();

// Import only the HTTP functions we need
import {
  getGoogleIntegrationStatusHttp,
  initiateGoogleOAuthHttp,
  handleGoogleOAuthCallbackHttp,
  listGoogleDriveFoldersHttp,
  getGoogleDriveFilesHttp,
  createGoogleDriveFolderHttp,
  uploadToGoogleDriveHttp
} from './src/integrations/googleDriveHttp';

// Export only HTTP functions
export {
  getGoogleIntegrationStatusHttp,
  initiateGoogleOAuthHttp,
  handleGoogleOAuthCallbackHttp,
  listGoogleDriveFoldersHttp,
  getGoogleDriveFilesHttp,
  createGoogleDriveFolderHttp,
  uploadToGoogleDriveHttp
};
`;

// Write the minimal index file
fs.writeFileSync(path.join(__dirname, 'src', 'index-minimal.ts'), minimalIndex);

console.log('✅ Minimal index file created');
console.log('🚀 Deploying Google Drive HTTP functions...');

// Execute the deployment
const { execSync } = require('child_process');

try {
  // Deploy only the HTTP functions
  execSync('firebase deploy --only functions:getGoogleIntegrationStatusHttp,functions:initiateGoogleOAuthHttp,functions:handleGoogleOAuthCallbackHttp,functions:listGoogleDriveFoldersHttp,functions:getGoogleDriveFilesHttp,functions:createGoogleDriveFolderHttp,functions:uploadToGoogleDriveHttp', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('✅ Google Drive HTTP functions deployed successfully!');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
