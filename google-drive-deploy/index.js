/**
 * Google Drive Integration Functions
 * Standalone deployment for Google Drive integration
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const crypto = require('crypto');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

// Get encryption key from Firebase Config
function getEncryptionKey() {
  const config = functions.config();
  const key = config?.integrations?.encryption_key;
  
  if (!key) {
    throw new Error('Encryption key not configured in Firebase Config');
  }
  
  return key;
}

// Generate secure random state for OAuth
function generateSecureState() {
  return crypto.randomBytes(32).toString('hex');
}

// Verify state parameter
function verifyState(state, expectedState) {
  return state === expectedState;
}

// Hash sensitive data for logging
function hashForLogging(data) {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
}

// Encrypt tokens for storage
function encryptTokens(tokens) {
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
  return {
    encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    tag: tag.toString('hex')
  };
}

// Decrypt tokens
function decryptTokens(encryptedData) {
  const key = getEncryptionKey();
  
  // Extract components
  const { encrypted, iv, salt, tag } = encryptedData;
  
  // Recreate key using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(
    key,
    Buffer.from(salt, 'hex'),
    10000,
    32,
    'sha256'
  );
  
  // Decrypt using AES-256-GCM
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    derivedKey,
    Buffer.from(iv, 'hex')
  );
  
  // Set authentication tag
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  // Parse the JSON string back to an object
  return JSON.parse(decrypted);
}

// Helper functions for API responses
function createSuccessResponse(data, message) {
  return {
    success: true,
    data,
    message
  };
}

function createErrorResponse(error, errorDetails) {
  return {
    success: false,
    error: error instanceof Error ? error.message : error,
    errorDetails
  };
}

// Google OAuth configuration
function getOAuthConfig() {
  const GOOGLE_CLIENT_ID = functions.config().google?.client_id;
  const GOOGLE_CLIENT_SECRET = functions.config().google?.client_secret;
  const REDIRECT_URI = functions.config().google?.redirect_uri || 'https://backbone-client.web.app/auth/google/callback';
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI
  };
}

// Create OAuth2 client
function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Google Drive API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents'
];

// Initiate Google OAuth flow
exports.initiateGoogleOAuth = functions.https.onCall(async (data, context) => {
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
      .collection('integrations')
      .doc(organizationId)
      .collection('oauthStates')
      .doc(userId)
      .set({
        state,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        provider: 'google'
      });

    // Create OAuth client and generate authorization URL
    const oauth2Client = createOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: `${userId}:${organizationId}:${state}`,
      prompt: 'consent' // Force to get refresh token
    });

    console.log(`Generated OAuth URL for user ${hashForLogging(userId)}`);

    return createSuccessResponse({
      authUrl,
      message: 'Please complete OAuth flow in the popup window'
    });
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return createErrorResponse(error);
  }
});

// Handle Google OAuth callback
exports.handleGoogleOAuthCallback = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const { code, state } = data;
    if (!code || !state) {
      throw new Error('Missing authorization code or state');
    }

    // Parse state parameter
    const [userId, organizationId, stateToken] = state.split(':');

    // Verify state token
    const stateDoc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('oauthStates')
      .doc(userId)
      .get();

    if (!stateDoc.exists || stateDoc.data().state !== stateToken) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for tokens
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const name = userInfo.data.name;

    // Encrypt tokens for storage
    const encryptedTokens = encryptTokens(tokens);

    // Store tokens in Firestore
    await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .set({
        tokens: encryptedTokens,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        userId,
        organizationId,
        accountEmail: email,
        accountName: name
      });

    // Clean up state token
    await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('oauthStates')
      .doc(userId)
      .delete();

    console.log(`Google Drive connected for user ${hashForLogging(userId)}`);

    return createSuccessResponse({
      accountEmail: email,
      accountName: name
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return createErrorResponse(error);
  }
});

// Refresh Google access token
exports.refreshGoogleAccessToken = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Get encrypted tokens from Firestore
    const doc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .get();

    if (!doc.exists) {
      throw new Error('No Google Drive connection found');
    }

    const encryptedTokens = doc.data().tokens;
    const tokens = decryptTokens(encryptedTokens);

    // Create OAuth client
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Refresh token
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Encrypt and store new tokens
    const newEncryptedTokens = encryptTokens(credentials);

    await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .update({
        tokens: newEncryptedTokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    return createSuccessResponse({
      message: 'Access token refreshed successfully'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return createErrorResponse(error);
  }
});

// Get Google Drive integration status
exports.getGoogleIntegrationStatus = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Check if tokens exist in Firestore
    const doc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .get();

    if (!doc.exists) {
      return createSuccessResponse({
        connected: false,
        message: 'Not connected to Google Drive'
      });
    }

    const userData = doc.data();
    const encryptedTokens = userData.tokens;

    if (!encryptedTokens) {
      return createSuccessResponse({
        connected: false,
        message: 'No tokens found'
      });
    }

    // Decrypt tokens
    const tokens = decryptTokens(encryptedTokens);

    // Test the connection
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    try {
      await drive.about.get({ fields: 'user' });
      return createSuccessResponse({
        connected: true,
        message: 'Connected to Google Drive',
        accountEmail: userData.accountEmail || 'Unknown',
        accountName: userData.accountName || 'Unknown'
      });
    } catch (error) {
      // Token expired, try to refresh
      if (tokens.refresh_token) {
        try {
          await oauth2Client.refreshAccessToken();
          return createSuccessResponse({
            connected: true,
            message: 'Connected to Google Drive (token refreshed)',
            accountEmail: userData.accountEmail || 'Unknown',
            accountName: userData.accountName || 'Unknown'
          });
        } catch (refreshError) {
          return createSuccessResponse({
            connected: false,
            message: 'Connection expired, please reconnect'
          });
        }
      } else {
        return createSuccessResponse({
          connected: false,
          message: 'Connection expired, please reconnect'
        });
      }
    }
  } catch (error) {
    console.error('Status check error:', error);
    return createErrorResponse(error);
  }
});

// List Google Drive folders
exports.listGoogleDriveFolders = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { parentId } = data || {};

    // Get tokens from Firestore
    const doc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .get();

    if (!doc.exists) {
      throw new Error('Not connected to Google Drive');
    }

    const encryptedTokens = doc.data().tokens;
    const tokens = decryptTokens(encryptedTokens);

    // Create OAuth client
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Build query
    let query = "mimeType='application/vnd.google-apps.folder'";
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    // List folders
    const response = await drive.files.list({
      q: query,
      fields: 'files(id,name,parents,createdTime,modifiedTime)',
      pageSize: 100
    });

    return createSuccessResponse({
      folders: response.data.files || [],
      message: `Found ${response.data.files?.length || 0} folders`
    });
  } catch (error) {
    console.error('List folders error:', error);
    return createErrorResponse(error);
  }
});

// Get Google Drive files
exports.getGoogleDriveFiles = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId } = data || {};

    // Get tokens from Firestore
    const doc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .get();

    if (!doc.exists) {
      throw new Error('Not connected to Google Drive');
    }

    const encryptedTokens = doc.data().tokens;
    const tokens = decryptTokens(encryptedTokens);

    // Create OAuth client
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Build query
    let query = "";
    if (folderId) {
      query = `'${folderId}' in parents`;
    }

    // List files
    const response = await drive.files.list({
      q: query,
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,parents)',
      pageSize: 100
    });

    return createSuccessResponse({
      files: response.data.files || [],
      message: `Found ${response.data.files?.length || 0} files`
    });
  } catch (error) {
    console.error('Get files error:', error);
    return createErrorResponse(error);
  }
});

// Create Google Drive folder
exports.createGoogleDriveFolder = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { name, parentId } = data || {};

    if (!name) {
      throw new Error('Folder name is required');
    }

    // Get tokens from Firestore
    const doc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .get();

    if (!doc.exists) {
      throw new Error('Not connected to Google Drive');
    }

    const encryptedTokens = doc.data().tokens;
    const tokens = decryptTokens(encryptedTokens);

    // Create OAuth client
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create folder metadata
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder'
    };

    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    // Create folder
    const response = await drive.files.create({
      resource: fileMetadata,
      fields: 'id,name,parents,createdTime,modifiedTime'
    });

    return createSuccessResponse({
      folder: response.data,
      message: `Folder '${name}' created successfully`
    });
  } catch (error) {
    console.error('Create folder error:', error);
    return createErrorResponse(error);
  }
});

// Upload to Google Drive
exports.uploadToGoogleDrive = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { name, content, mimeType, folderId } = data || {};

    if (!name || !content) {
      throw new Error('File name and content are required');
    }

    // Get tokens from Firestore
    const doc = await admin.firestore()
      .collection('integrations')
      .doc(organizationId)
      .collection('googleDrive')
      .doc(userId)
      .get();

    if (!doc.exists) {
      throw new Error('Not connected to Google Drive');
    }

    const encryptedTokens = doc.data().tokens;
    const tokens = decryptTokens(encryptedTokens);

    // Create OAuth client
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create file metadata
    const fileMetadata = {
      name
    };

    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    // Create media
    const media = {
      mimeType: mimeType || 'text/plain',
      body: content
    };

    // Upload file
    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id,name,mimeType,size,createdTime,modifiedTime,parents'
    });

    return createSuccessResponse({
      file: response.data,
      message: `File '${name}' uploaded successfully`
    });
  } catch (error) {
    console.error('Upload error:', error);
    return createErrorResponse(error);
  }
});
