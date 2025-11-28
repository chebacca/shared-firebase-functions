#!/usr/bin/env node

/**
 * Deploy Google Drive HTTP Functions with CORS Support
 * Uses existing compiled files and creates a working index
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔥 Creating working index file for Google Drive HTTP functions...');

// Create a working index file that uses the correct import paths
const workingIndex = `
/**
 * Working Google Drive HTTP Functions Index
 * Uses correct import paths for compiled files
 */

const { initializeApp } = require('firebase-admin/app');
const functions = require('firebase-functions');

// Initialize Firebase Admin
initializeApp();

// Import only the HTTP functions we need
const {
  getGoogleIntegrationStatusHttp,
  listGoogleDriveFoldersHttp
} = require('./integrations/googleDriveHttp');

// Export only HTTP functions
module.exports = {
  getGoogleIntegrationStatusHttp,
  listGoogleDriveFoldersHttp
};
`;

// Write the working index file
fs.writeFileSync(path.join(__dirname, 'lib', 'index-working.js'), workingIndex);

console.log('✅ Working index file created');

// Deploy only the HTTP functions using the working index
console.log('🚀 Deploying Google Drive HTTP functions...');

try {
  // Temporarily rename the main index and use our working index
  const mainIndexPath = path.join(__dirname, 'lib', 'index.js');
  const backupIndexPath = path.join(__dirname, 'lib', 'index-backup.js');
  
  // Backup the main index
  if (fs.existsSync(mainIndexPath)) {
    fs.copyFileSync(mainIndexPath, backupIndexPath);
  }
  
  // Use our working index
  fs.copyFileSync(path.join(__dirname, 'lib', 'index-working.js'), mainIndexPath);
  
  // Deploy only the HTTP functions
  execSync('firebase deploy --only functions:getGoogleIntegrationStatusHttp,functions:listGoogleDriveFoldersHttp --project backbone-logic', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  // Restore the original index
  if (fs.existsSync(backupIndexPath)) {
    fs.copyFileSync(backupIndexPath, mainIndexPath);
    fs.unlinkSync(backupIndexPath);
  }
  
  console.log('✅ Google Drive HTTP functions deployed successfully!');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  
  // Restore the original index even if deployment failed
  const mainIndexPath = path.join(__dirname, 'lib', 'index.js');
  const backupIndexPath = path.join(__dirname, 'lib', 'index-backup.js');
  
  if (fs.existsSync(backupIndexPath)) {
    fs.copyFileSync(backupIndexPath, mainIndexPath);
    fs.unlinkSync(backupIndexPath);
  }
  
  process.exit(1);
}
