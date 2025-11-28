#!/usr/bin/env node

/**
 * Deploy Google Drive HTTP Functions with CORS Support
 * This script creates a minimal index file with only the HTTP functions we need
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  listGoogleDriveFoldersHttp
} from './integrations/googleDriveHttp';

// Export only HTTP functions
export {
  getGoogleIntegrationStatusHttp,
  listGoogleDriveFoldersHttp
};
`;

// Write the minimal index file
fs.writeFileSync(path.join(__dirname, 'src', 'index-google-http.ts'), minimalIndex);

console.log('✅ Minimal index file created');

// Build only the Google Drive HTTP functions
console.log('🔨 Building Google Drive HTTP functions...');

try {
  // Use tsc to compile only the specific files we need
  execSync('npx tsc src/integrations/googleDriveHttp.ts --outDir lib/integrations --target es2020 --module commonjs --esModuleInterop --skipLibCheck --declaration', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  execSync('npx tsc src/shared/utils.ts --outDir lib/shared --target es2020 --module commonjs --esModuleInterop --skipLibCheck --declaration', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  execSync('npx tsc src/integrations/encryption.ts --outDir lib/integrations --target es2020 --module commonjs --esModuleInterop --skipLibCheck --declaration', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  execSync('npx tsc src/index-google-http.ts --outDir lib --target es2020 --module commonjs --esModuleInterop --skipLibCheck --declaration', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('✅ Build completed');
  
  // Deploy only the HTTP functions
  console.log('🚀 Deploying Google Drive HTTP functions...');
  
  execSync('firebase deploy --only functions:getGoogleIntegrationStatusHttp,functions:listGoogleDriveFoldersHttp --project backbone-logic', {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  console.log('✅ Google Drive HTTP functions deployed successfully!');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
