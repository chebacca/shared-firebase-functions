#!/usr/bin/env node

/**
 * Deploy Google Drive HTTP Functions - Standalone Approach
 * Creates minimal HTTP functions with CORS support directly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔥 Creating standalone Google Drive HTTP functions...');

// Create a standalone index file with inline HTTP functions
const standaloneIndex = `
/**
 * Standalone Google Drive HTTP Functions
 * Minimal implementation with CORS support
 */

const { initializeApp } = require('firebase-admin/app');
const functions = require('firebase-functions');
const { google } = require('googleapis');
const admin = require('firebase-admin');

// Initialize Firebase Admin
initializeApp();

// CORS headers helper
function setCorsHeaders(req, res) {
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173',
    'null'
  ];
  
  const origin = req.headers.origin;
  
  // Always allow the origin that made the request in development mode
  if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
    res.set('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
    res.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    // In production, be more restrictive but still allow the request to proceed
    res.set('Access-Control-Allow-Origin', 'https://backbone-client.web.app');
  }
  
  // Set other CORS headers
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version, Origin');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Max-Age', '3600'); // Cache preflight request for 1 hour
}

// Verify Firebase Auth token from Authorization header
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header required');
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return {
      userId: decodedToken.uid,
      organizationId: decodedToken.organizationId || 'default'
    };
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

/**
 * Get Google Drive integration status - HTTP version
 */
exports.getGoogleIntegrationStatusHttp = functions.https.onRequest(async (req, res) => {
  // Set CORS headers first thing - before any error handling
  setCorsHeaders(req, res);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);

    // Get user's Google integration - try multiple collection paths
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userOrgId = userData?.organizationId || organizationId || 'default-org';
    
    // Try multiple collection paths for Google Drive tokens
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(userOrgId)
      .collection('integrations')
      .doc('google_drive')
      .get();
    
    if (!integrationDoc.exists) {
      // Fallback to userIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('userIntegrations')
        .doc(\`\${userId}_google\`)
        .get();
    }
    
    if (!integrationDoc.exists) {
      // Fallback to cloudIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(\`\${userOrgId}_google_\${userId}\`)
        .get();
    }

    if (!integrationDoc.exists) {
      res.status(200).json({
        success: true,
        connected: false,
        message: 'Google Drive not connected'
      });
      return;
    }

    const integrationData = integrationDoc.data();
    
    // Check if tokens are valid (basic check)
    const hasValidTokens = integrationData.tokens && 
                          integrationData.tokens.access_token && 
                          integrationData.tokens.refresh_token;

    res.status(200).json({
      success: true,
      connected: hasValidTokens,
      accountEmail: integrationData.accountEmail || null,
      accountName: integrationData.accountName || null,
      expiresAt: integrationData.expiresAt || null
    });

  } catch (error) {
    console.error('Error getting Google integration status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get integration status',
      details: error.message
    });
  }
});

/**
 * List Google Drive folders - HTTP version
 */
exports.listGoogleDriveFoldersHttp = functions.https.onRequest(async (req, res) => {
  // Set CORS headers first thing - before any error handling
  setCorsHeaders(req, res);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);

    // Get user's Google integration - try multiple collection paths
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userOrgId = userData?.organizationId || organizationId || 'default-org';
    
    // Try multiple collection paths for Google Drive tokens
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(userOrgId)
      .collection('integrations')
      .doc('google_drive')
      .get();
    
    if (!integrationDoc.exists) {
      // Fallback to userIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('userIntegrations')
        .doc(\`\${userId}_google\`)
        .get();
    }
    
    if (!integrationDoc.exists) {
      // Fallback to cloudIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(\`\${userOrgId}_google_\${userId}\`)
        .get();
    }

    if (!integrationDoc.exists) {
      throw new Error('Google Drive not connected');
    }

    const integrationData = integrationDoc.data();
    
    // For now, return a simple response indicating the function is working
    // TODO: Implement actual Google Drive API calls when tokens are properly configured
    res.status(200).json({
      success: true,
      folders: [],
      message: 'Google Drive integration detected but API calls not yet implemented'
    });

  } catch (error) {
    console.error('Error listing Google Drive folders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list folders',
      details: error.message
    });
  }
});
`;

// Write the standalone index file
fs.writeFileSync(path.join(__dirname, 'lib', 'index-standalone.js'), standaloneIndex);

console.log('✅ Standalone index file created');

// Deploy the standalone functions
console.log('🚀 Deploying standalone Google Drive HTTP functions...');

try {
  // Temporarily rename the main index and use our standalone index
  const mainIndexPath = path.join(__dirname, 'lib', 'index.js');
  const backupIndexPath = path.join(__dirname, 'lib', 'index-backup.js');
  
  // Backup the main index
  if (fs.existsSync(mainIndexPath)) {
    fs.copyFileSync(mainIndexPath, backupIndexPath);
  }
  
  // Use our standalone index
  fs.copyFileSync(path.join(__dirname, 'lib', 'index-standalone.js'), mainIndexPath);
  
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
  
  console.log('✅ Standalone Google Drive HTTP functions deployed successfully!');
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
