/**
 * Google Drive Integration Service
 * 
 * Handles OAuth authentication and API operations for Google Drive
 * Provides server-side OAuth flow with secure token management
 */

import { google } from 'googleapis';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptTokens, generateSecureState, verifyState, hashForLogging } from './encryption';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';

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

// Google Drive API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents'
];

/**
 * Initiate Google OAuth flow
 * Returns authorization URL for user to authenticate
 */
export const initiateGoogleOAuth = functions.https.onCall(async (data, context) => {
  try {
    // Verify user authentication
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

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

    return createSuccessResponse({
      authUrl,
      state
    });

  } catch (error) {
    console.error('Google OAuth initiation failed:', error);
    return createErrorResponse('Failed to initiate Google OAuth', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Handle Google OAuth callback
 * Exchange authorization code for tokens
 */
export const handleGoogleOAuthCallback = functions.https.onCall(async (data, context) => {
  try {
    const { code, state } = data;

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

    const stateData = stateDoc.data();
    const userId = stateData?.userId;
    const organizationId = stateData?.organizationId;

    if (!userId || !organizationId) {
      throw new Error('Invalid state data');
    }

    // Clean up state document
    await stateDoc.ref.delete();

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('Failed to obtain access token');
    }

    // Set credentials and get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Encrypt tokens for storage
    const encryptedTokens = encryptTokens(tokens);

    // Store encrypted tokens in Firestore
    const integrationDoc = {
      userId,
      organizationId,
      provider: 'google',
      accountEmail: userInfo.data.email,
      accountName: userInfo.data.name,
      encryptedTokens,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: tokens.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(tokens.expiry_date)) : null
    };

    await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .set(integrationDoc);

    console.log(`Google OAuth completed for user ${hashForLogging(userId)} in org ${organizationId}, account: ${userInfo.data.email}`);

    return createSuccessResponse({
      accountEmail: userInfo.data.email,
      accountName: userInfo.data.name,
      connected: true
    });

  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return createErrorResponse('Failed to complete Google OAuth', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Refresh Google access token
 */
export async function refreshGoogleAccessToken(userId: string, organizationId: string): Promise<any> {
  try {
    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('Google integration not found');
    }

    const integrationData = integrationDoc.data();
    const encryptedTokens = integrationData?.encryptedTokens;

    if (!encryptedTokens) {
      throw new Error('No tokens found for Google integration');
    }

    // Decrypt tokens
    const tokens = decryptTokens(encryptedTokens);

    if (!tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Set credentials and refresh
    oauth2Client.setCredentials(tokens);
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Encrypt new tokens
    const newEncryptedTokens = encryptTokens(credentials);

    // Update Firestore
    await integrationDoc.ref.update({
      encryptedTokens: newEncryptedTokens,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: credentials.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(credentials.expiry_date)) : null
    });

    return credentials;

  } catch (error) {
    console.error('Google token refresh failed:', error);
    throw error;
  }
}

/**
 * List Google Drive folders
 */
export const listGoogleDriveFolders = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId = 'root' } = data;

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    oauth2Client.setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List folders
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, parents)',
      orderBy: 'name'
    });

    const folders = response.data.files?.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      parents: file.parents
    })) || [];

    return createSuccessResponse({ folders });

  } catch (error) {
    console.error('Failed to list Google Drive folders:', error);
    return createErrorResponse('Failed to list folders', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Google Drive files in a folder
 */
export const getGoogleDriveFiles = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId } = data;

    if (!folderId) {
      throw new Error('Folder ID is required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    oauth2Client.setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List files in folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
      orderBy: 'name'
    });

    const files = response.data.files?.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink
    })) || [];

    return createSuccessResponse({ files });

  } catch (error) {
    console.error('Failed to get Google Drive files:', error);
    return createErrorResponse('Failed to get files', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Create Google Drive folder
 */
export const createGoogleDriveFolder = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { name, parentId = 'root' } = data;

    if (!name) {
      throw new Error('Folder name is required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    oauth2Client.setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create folder
    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      fields: 'id, name, mimeType, createdTime, modifiedTime, parents'
    });

    const folder = {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      createdTime: response.data.createdTime,
      modifiedTime: response.data.modifiedTime,
      parents: response.data.parents
    };

    return createSuccessResponse({ folder });

  } catch (error) {
    console.error('Failed to create Google Drive folder:', error);
    return createErrorResponse('Failed to create folder', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Upload file to Google Drive
 */
export const uploadToGoogleDrive = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { fileName, fileContent, mimeType, folderId = 'root' } = data;

    if (!fileName || !fileContent) {
      throw new Error('File name and content are required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    oauth2Client.setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Convert base64 content to buffer
    const fileBuffer = Buffer.from(fileContent, 'base64');

    // Upload file
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: fileBuffer
      },
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink'
    });

    const file = {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      size: response.data.size,
      createdTime: response.data.createdTime,
      modifiedTime: response.data.modifiedTime,
      webViewLink: response.data.webViewLink
    };

    return createSuccessResponse({ file });

  } catch (error) {
    console.error('Failed to upload to Google Drive:', error);
    return createErrorResponse('Failed to upload file', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Google integration status
 */
export const getGoogleIntegrationStatus = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      return createSuccessResponse({ connected: false });
    }

    const integrationData = integrationDoc.data();
    const expiresAt = integrationData?.expiresAt?.toDate();
    const isExpired = expiresAt && expiresAt < new Date();

    return createSuccessResponse({
      connected: !isExpired,
      accountEmail: integrationData?.accountEmail,
      accountName: integrationData?.accountName,
      expiresAt: expiresAt?.toISOString()
    });

  } catch (error) {
    console.error('Failed to get Google integration status:', error);
    return createErrorResponse('Failed to get integration status', error instanceof Error ? error.message : 'Unknown error');
  }
});
