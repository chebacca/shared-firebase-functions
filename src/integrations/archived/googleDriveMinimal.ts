/**
 * Google Drive Integration Service - Minimal Version
 * 
 * Handles OAuth authentication and API operations for Google Drive
 * Provides server-side OAuth flow with secure token management
 */

import { google } from 'googleapis';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Google OAuth configuration
// NOTE: This file is archived. Use environment variables instead of functions.config()
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '749245129278-vnepq570jrh5ji94c9olshc282bj1l86.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'GOCSPX-test_client_secret_for_testing';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4001/dashboard/integrations';

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

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

// Helper functions
function getEncryptionKey(): string {
  return process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'default-encryption-key-for-development';
}

function createSuccessResponse(data: any, message?: string) {
  return {
    success: true,
    data,
    message
  };
}

function createErrorResponse(error: string, errorDetails?: string) {
  return {
    success: false,
    error,
    errorDetails
  };
}

function encryptTokens(tokens: any): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Create key using PBKDF2
    const derivedKey = crypto.pbkdf2Sync(key, salt, 10000, 32, 'sha256');

    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    const tokenString = JSON.stringify(tokens);

    let encrypted = cipher.update(tokenString, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const tag = cipher.getAuthTag();

    // Return everything needed for decryption
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      tag: tag.toString('hex')
    });
  } catch (error) {
    console.error('Token encryption failed:', error);
    throw new Error('Failed to encrypt tokens');
  }
}

function decryptTokens(encryptedData: string): any {
  try {
    const key = getEncryptionKey();
    const data = JSON.parse(encryptedData);

    const iv = Buffer.from(data.iv, 'hex');
    const salt = Buffer.from(data.salt, 'hex');
    const tag = Buffer.from(data.tag, 'hex');

    // Create key using PBKDF2
    const derivedKey = crypto.pbkdf2Sync(key, salt, 10000, 32, 'sha256');

    // Decrypt using AES-256-GCM
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Token decryption failed:', error);
    throw new Error('Failed to decrypt tokens');
  }
}

function generateSecureState(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashForLogging(data: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 8);
}

/**
 * Initiate Google OAuth flow
 * Returns authorization URL for user to authenticate
 */
export const initiateGoogleOAuth = functions.https.onCall(async (data, context) => {
  try {
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent'
    });

    console.log(`Generated OAuth URL for user ${hashForLogging({ userId, organizationId })}`);

    return createSuccessResponse({
      authUrl,
      state
    });

  } catch (error) {
    console.error('Failed to initiate Google OAuth:', error);
    return createErrorResponse('Failed to initiate OAuth flow', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Handle Google OAuth callback
 * Exchange authorization code for access tokens
 */
export const handleGoogleOAuthCallback = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const { code, state } = data;
    if (!code || !state) {
      throw new Error('Missing authorization code or state parameter');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Verify state parameter
    const stateDoc = await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .get();

    if (!stateDoc.exists) {
      throw new Error('Invalid or expired state parameter');
    }

    const stateData = stateDoc.data();
    if (!stateData || stateData.userId !== userId || stateData.organizationId !== organizationId) {
      throw new Error('State parameter mismatch');
    }

    // Clean up state document
    await stateDoc.ref.delete();

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const accountEmail = userInfo.data.email;
    const accountName = userInfo.data.name;

    // Encrypt tokens for storage
    const encryptedTokens = encryptTokens(tokens);

    // Store tokens in Firestore
    const integrationDoc = {
      userId,
      organizationId,
      accountEmail,
      accountName,
      tokens: encryptedTokens,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      lastUsed: admin.firestore.FieldValue.serverTimestamp()
    };

    await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .set(integrationDoc);

    console.log(`Google OAuth tokens stored for user ${hashForLogging({ userId, organizationId, accountEmail })}`);

    return createSuccessResponse({
      accountEmail,
      accountName,
      connected: true
    });

  } catch (error) {
    console.error('Failed to handle Google OAuth callback:', error);
    return createErrorResponse('Failed to complete OAuth flow', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Exchange Google authorization code for tokens (legacy function)
 */
export const exchangeGoogleCodeForTokens = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const { code, state } = data;
    if (!code || !state) {
      throw new Error('Missing authorization code or state parameter');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const accountEmail = userInfo.data.email;
    const accountName = userInfo.data.name;

    // Encrypt tokens for storage
    const encryptedTokens = encryptTokens(tokens);

    // Store tokens in Firestore
    const integrationDoc = {
      userId,
      organizationId,
      accountEmail,
      accountName,
      tokens: encryptedTokens,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      lastUsed: admin.firestore.FieldValue.serverTimestamp()
    };

    await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .set(integrationDoc);

    console.log(`Google OAuth tokens stored for user ${hashForLogging({ userId, organizationId, accountEmail })}`);

    return createSuccessResponse({
      accountEmail,
      accountName,
      connected: true
    });

  } catch (error) {
    console.error('Failed to exchange Google code for tokens:', error);
    return createErrorResponse('Failed to exchange code for tokens', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Refresh Google access token
 */
export const refreshGoogleAccessToken = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Get stored tokens
    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('No Google integration found');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData) {
      throw new Error('Integration data not found');
    }
    const tokens = decryptTokens(integrationData.tokens);

    // Set credentials and refresh
    oauth2Client.setCredentials(tokens);
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Encrypt new tokens
    const encryptedTokens = encryptTokens(credentials);

    // Update stored tokens
    await integrationDoc.ref.update({
      tokens: encryptedTokens,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      lastUsed: admin.firestore.FieldValue.serverTimestamp()
    });

    return createSuccessResponse({
      refreshed: true,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null
    });

  } catch (error) {
    console.error('Failed to refresh Google access token:', error);
    return createErrorResponse('Failed to refresh access token', error instanceof Error ? error.message : 'Unknown error');
  }
});

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

    // Get stored tokens
    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('No Google integration found');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData) {
      throw new Error('Integration data not found');
    }
    const tokens = decryptTokens(integrationData.tokens);

    // Set credentials
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List folders
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name, createdTime, modifiedTime)'
    });

    return createSuccessResponse({
      folders: response.data.files || []
    });

  } catch (error) {
    console.error('Failed to list Google Drive folders:', error);
    return createErrorResponse('Failed to list folders', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Google Drive files
 */
export const getGoogleDriveFiles = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId } = data;

    // Get stored tokens
    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('No Google integration found');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData) {
      throw new Error('Integration data not found');
    }
    const tokens = decryptTokens(integrationData.tokens);

    // Set credentials
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List files
    const query = folderId ? `'${folderId}' in parents` : '';
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)'
    });

    return createSuccessResponse({
      files: response.data.files || []
    });

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
    const { name, parentId } = data;

    // Get stored tokens
    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('No Google integration found');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData) {
      throw new Error('Integration data not found');
    }
    const tokens = decryptTokens(integrationData.tokens);

    // Set credentials
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create folder
    const folderMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    };

    const response = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id, name, createdTime'
    });

    return createSuccessResponse({
      folder: response.data
    });

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
    const { fileName, fileContent, mimeType, folderId } = data;

    // Get stored tokens
    const integrationDoc = await admin.firestore()
      .collection('cloudIntegrations')
      .doc(`${organizationId}_google_${userId}`)
      .get();

    if (!integrationDoc.exists) {
      throw new Error('No Google integration found');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData) {
      throw new Error('Integration data not found');
    }
    const tokens = decryptTokens(integrationData.tokens);

    // Set credentials
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Convert base64 content to buffer
    const fileBuffer = Buffer.from(fileContent, 'base64');

    // Upload file
    const fileMetadata = {
      name: fileName,
      parents: folderId ? [folderId] : undefined
    };

    const media = {
      mimeType: mimeType || 'text/plain',
      body: fileBuffer
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, createdTime, size'
    });

    return createSuccessResponse({
      file: response.data
    });

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
