/**
 * Google Drive Integration Service - HTTP Functions
 * 
 * HTTP versions of Google Drive functions to bypass CORS restrictions
 * These functions use HTTP requests instead of httpsCallable
 */

import { google } from 'googleapis';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptTokens, generateSecureState, verifyState, hashForLogging } from './encryption';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = functions.config().google?.client_id;
const GOOGLE_CLIENT_SECRET = functions.config().google?.client_secret;
const REDIRECT_URI = functions.config().google?.redirect_uri || 'https://backbone-client.web.app/auth/google/callback';

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// Google API scopes (Drive + Calendar for video conferencing)
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.readonly'
];

/**
 * Verify Firebase Auth token from Authorization header
 */
async function verifyAuthToken(req: any): Promise<{ userId: string; organizationId: string }> {
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
 * Initiate Google OAuth flow - HTTP version
 * Returns authorization URL for user to authenticate
 */
export const initiateGoogleOAuthHttp = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);

    // Generate secure state parameter
    const state = generateSecureState();

    // Store state in Firestore for verification
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .set({
        userId,
        organizationId,
        provider: 'google',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // 10 minutes
      });

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });

    console.log(`Google OAuth initiated for user ${hashForLogging(userId)} in org ${organizationId}`);

    const response = createSuccessResponse({
      authUrl,
      state
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('Google OAuth initiation failed:', error);
    const response = createErrorResponse('Failed to initiate Google OAuth', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});

/**
 * Handle Google OAuth callback - HTTP version
 * Exchange authorization code for tokens
 */
export const handleGoogleOAuthCallbackHttp = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { code, state } = req.body;

    if (!code || !state) {
      throw new Error('Authorization code and state are required');
    }

    // Verify state parameter
    const stateDoc = await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .get();

    if (!stateDoc.exists) {
      throw new Error('Invalid or expired state parameter');
    }

    const stateData = stateDoc.data()!;
    const { userId, organizationId } = stateData;

    // Check if state has expired
    const now = new Date();
    const expiresAt = stateData.expiresAt.toDate();
    if (now > expiresAt) {
      throw new Error('State parameter has expired');
    }

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Encrypt tokens before storing
    const encryptedTokens = encryptTokens(tokens);

    // Store tokens in Firestore
    await admin.firestore()
      .collection('userIntegrations')
      .doc(`${userId}_google`)
      .set({
        userId,
        organizationId,
        provider: 'google',
        tokens: encryptedTokens,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    // Clean up state document
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .delete();

    console.log(`Google OAuth completed for user ${hashForLogging(userId)} in org ${organizationId}`);

    const response = createSuccessResponse({
      success: true,
      message: 'Google Drive connected successfully'
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    const response = createErrorResponse('Failed to complete Google OAuth', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});

/**
 * Get Google Drive integration status - HTTP version
 */
export const getGoogleIntegrationStatusHttp = functions.https.onRequest(async (req, res) => {
  // Set CORS headers first thing - before any error handling
  setCorsHeaders(req, res);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Check if this is a request from Clip Show Pro (no auth required for status check)
    const userAgent = req.headers['user-agent'] || '';
    const isClipShowPro = userAgent.includes('Clip Show Pro') || 
                         req.headers['x-client-type'] === 'clip-show-pro' ||
                         req.headers['origin']?.includes('localhost:4001') ||
                         req.headers['origin']?.includes('localhost:4010');

    if (isClipShowPro) {
      // For Clip Show Pro, return a simple status without authentication
      console.log('Clip Show Pro request detected, returning unauthenticated status');
      const response = createSuccessResponse({
        connected: false,
        accountEmail: null,
        connectedAt: null,
        message: 'Authentication required for Google Drive integration'
      });
      res.status(200).json(response);
      return;
    }

    // For other apps, require authentication
    const { userId, organizationId } = await verifyAuthToken(req);

    // Check if user has Google integration - try multiple collection paths
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
        .doc(`${userId}_google`)
        .get();
    }
    
    if (!integrationDoc.exists) {
      // Fallback to cloudIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(`${userOrgId}_google_${userId}`)
        .get();
    }

    if (!integrationDoc.exists) {
      const response = createSuccessResponse({
        connected: false,
        accountEmail: null,
        connectedAt: null
      });
      res.status(200).json(response);
      return;
    }

    const integrationData = integrationDoc.data()!;
    
    // Check if tokens are still valid
    try {
      const tokens = decryptTokens(integrationData.tokens);
      oauth2Client.setCredentials(tokens);
      
      // Test the connection by getting user info
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      const response = createSuccessResponse({
        connected: true,
        accountEmail: userInfo.data.email,
        connectedAt: integrationData.connectedAt?.toDate()
      });
      res.status(200).json(response);
      
    } catch (tokenError) {
      // Tokens are invalid, mark as disconnected
      await admin.firestore()
        .collection('userIntegrations')
        .doc(`${userId}_google`)
        .delete();
      
      const response = createSuccessResponse({
        connected: false,
        accountEmail: null,
        connectedAt: null
      });
      res.status(200).json(response);
    }

  } catch (error) {
    console.error('Get Google integration status failed:', error);
    const response = createErrorResponse('Failed to get integration status', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});

/**
 * List Google Drive folders - HTTP version
 */
export const listGoogleDriveFoldersHttp = functions.https.onRequest(async (req, res) => {
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
        .doc(`${userId}_google`)
        .get();
    }
    
    if (!integrationDoc.exists) {
      // Fallback to cloudIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(`${userOrgId}_google_${userId}`)
        .get();
    }

    if (!integrationDoc.exists) {
      throw new Error('Google Drive not connected');
    }

    const integrationData = integrationDoc.data()!;
    const tokens = decryptTokens(integrationData.tokens);
    oauth2Client.setCredentials(tokens);

    // Initialize Google Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List folders
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, parents, createdTime, modifiedTime)',
      orderBy: 'name'
    });

    const folders = response.data.files || [];

    const result = createSuccessResponse({
      folders: folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        parents: folder.parents,
        createdTime: folder.createdTime,
        modifiedTime: folder.modifiedTime
      }))
    });

    res.status(200).json(result);

  } catch (error) {
    console.error('List Google Drive folders failed:', error);
    const response = createErrorResponse('Failed to list folders', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});

/**
 * Get Google Drive files - HTTP version
 */
export const getGoogleDriveFilesHttp = functions.https.onRequest(async (req, res) => {
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

    const { folderId } = req.body;

    if (!folderId) {
      throw new Error('Folder ID is required');
    }

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
        .doc(`${userId}_google`)
        .get();
    }
    
    if (!integrationDoc.exists) {
      // Fallback to cloudIntegrations collection
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(`${userOrgId}_google_${userId}`)
        .get();
    }

    if (!integrationDoc.exists) {
      throw new Error('Google Drive not connected');
    }

    const integrationData = integrationDoc.data()!;
    const tokens = decryptTokens(integrationData.tokens);
    oauth2Client.setCredentials(tokens);

    // Initialize Google Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List files in folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
      orderBy: 'name'
    });

    const files = response.data.files || [];

    const result = createSuccessResponse({
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink
      }))
    });

    res.status(200).json(result);

  } catch (error) {
    console.error('Get Google Drive files failed:', error);
    const response = createErrorResponse('Failed to get files', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});

/**
 * Create Google Drive folder - HTTP version
 */
export const createGoogleDriveFolderHttp = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);

    const { name, parentId } = req.body;

    if (!name) {
      throw new Error('Folder name is required');
    }

    // Get user's Google integration
    const integrationDoc = await admin.firestore()
      .collection('userIntegrations')
      .doc(`${userId}_google`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('Google Drive not connected');
    }

    const integrationData = integrationDoc.data()!;
    const tokens = decryptTokens(integrationData.tokens);
    oauth2Client.setCredentials(tokens);

    // Initialize Google Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create folder
    const folderMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    };

    const response = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id, name, parents, createdTime, modifiedTime'
    });

    const result = createSuccessResponse({
      folder: {
        id: response.data.id,
        name: response.data.name,
        parents: response.data.parents,
        createdTime: response.data.createdTime,
        modifiedTime: response.data.modifiedTime
      }
    });

    res.status(200).json(result);

  } catch (error) {
    console.error('Create Google Drive folder failed:', error);
    const response = createErrorResponse('Failed to create folder', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});

/**
 * Upload to Google Drive - HTTP version
 */
export const uploadToGoogleDriveHttp = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);

    const { fileName, fileContent, mimeType, parentId } = req.body;

    if (!fileName || !fileContent) {
      throw new Error('File name and content are required');
    }

    // Get user's Google integration
    const integrationDoc = await admin.firestore()
      .collection('userIntegrations')
      .doc(`${userId}_google`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('Google Drive not connected');
    }

    const integrationData = integrationDoc.data()!;
    const tokens = decryptTokens(integrationData.tokens);
    oauth2Client.setCredentials(tokens);

    // Initialize Google Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Upload file
    const fileMetadata = {
      name: fileName,
      parents: parentId ? [parentId] : undefined
    };

    const media = {
      mimeType: mimeType || 'text/plain',
      body: Buffer.from(fileContent, 'base64')
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink'
    });

    const result = createSuccessResponse({
      file: {
        id: response.data.id,
        name: response.data.name,
        mimeType: response.data.mimeType,
        size: response.data.size,
        createdTime: response.data.createdTime,
        modifiedTime: response.data.modifiedTime,
        webViewLink: response.data.webViewLink
      }
    });

    res.status(200).json(result);

  } catch (error) {
    console.error('Upload to Google Drive failed:', error);
    const response = createErrorResponse('Failed to upload file', error instanceof Error ? error.message : 'Unknown error');
    res.status(400).json(response);
  }
});