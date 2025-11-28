#!/usr/bin/env node

/**
 * Deploy only Google Drive functions needed for organization-wide integration
 * This script creates a minimal index file with only the functions we need
 */

const fs = require('fs');
const path = require('path');

console.log('🔥 Creating minimal index file for Google Drive organization functions...');

// Create a minimal index file with only the functions we need
const minimalIndex = `
/**
 * Minimal Google Drive Organization Functions Index
 * Only exports the functions needed for organization-wide Google Drive integration
 */

import { initializeApp } from 'firebase-admin/app';
import * as functions from 'firebase-functions';

// Initialize Firebase Admin
initializeApp();

// Import only the functions we need
import {
  handleGoogleOAuthCallback,
  indexGoogleDriveFolder,
  getGoogleIntegrationStatus
} from './src/integrations/googleDrive';

// Export only the functions we need
export {
  handleGoogleOAuthCallback,
  indexGoogleDriveFolder,
  getGoogleIntegrationStatus
};
`;

// Write the minimal index file
fs.writeFileSync(path.join(__dirname, 'src', 'index-minimal.ts'), minimalIndex);

console.log('✅ Minimal index file created');
console.log('🚀 Deploying Google Drive organization functions...');

// Execute the deployment
const { execSync } = require('child_process');

try {
  // Deploy only the functions we need
  execSync('firebase deploy --only functions:handleGoogleOAuthCallback,functions:indexGoogleDriveFolder,functions:getGoogleIntegrationStatus', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('✅ Google Drive organization functions deployed successfully!');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
