/**
 * Google Drive OAuth Functions
 * 
 * Handle OAuth flow for Google Drive connections
 * Supports both user-level and organization-level connections
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as crypto from 'crypto';
import { getGoogleConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';
import { google } from 'googleapis';

/**
 * Encrypt sensitive token data
 */
function encryptToken(text: string): string {
  const algorithm = 'aes-256-gcm';
  
  // Get and validate encryption key
  let encryptionKeyValue: string;
  try {
    encryptionKeyValue = getEncryptionKey();
  } catch (keyError) {
    console.error('❌ [GoogleOAuth] Failed to get encryption key:', keyError);
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
  }

  if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
    console.error('❌ [GoogleOAuth] Encryption key is invalid:', {
      type: typeof encryptionKeyValue,
      length: encryptionKeyValue?.length || 0,
      minLength: 32,
    });
    throw new Error('Encryption key is invalid. ENCRYPTION_KEY must be at least 32 characters.');
  }

  // Ensure the key is exactly 32 bytes for AES-256-GCM
  // Use SHA-256 hash to derive a consistent 32-byte key from the secret
  let key: Buffer;
  try {
    key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
  } catch (hashError: any) {
    console.error('❌ [GoogleOAuth] Failed to derive key:', hashError);
    throw new Error('Failed to derive encryption key. Encryption key may be corrupted.');
  }

  if (!key || key.length !== 32) {
    throw new Error(`Invalid key length. Expected 32 bytes, got ${key?.length || 0}`);
  }

  const iv = crypto.randomBytes(16);
  
  try {
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (cipherError: any) {
    if (cipherError.message && cipherError.message.includes('Invalid key length')) {
      console.error('❌ [GoogleOAuth] Invalid key length error during encryption:', {
        keyLength: key?.length || 0,
        encryptionKeyValueLength: encryptionKeyValue?.length || 0,
      });
      throw new Error('Invalid key length. ENCRYPTION_KEY secret may be misconfigured.');
    }
    throw cipherError;
  }
}

/**
 * Decrypt sensitive token data
 */
function decryptToken(encryptedData: string): string {
  try {
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Invalid token format: token is missing or not a string');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid token format. Expected 3 parts separated by ':', got ${parts.length} parts.`);
    }

    const [ivHex, authTagHex, encrypted] = parts;
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid token format: missing required components (IV, auth tag, or encrypted data)');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    if (iv.length !== 16) {
      throw new Error(`Invalid IV length. Expected 16 bytes, got ${iv.length}`);
    }
    if (authTag.length !== 16) {
      throw new Error(`Invalid auth tag length. Expected 16 bytes, got ${authTag.length}`);
    }
    
    const algorithm = 'aes-256-gcm';
    
    // Get and validate encryption key
    let encryptionKeyValue: string;
    try {
      encryptionKeyValue = getEncryptionKey();
    } catch (keyError) {
      console.error('❌ [GoogleOAuth] Failed to get encryption key:', keyError);
      throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
    }

    if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
      console.error('❌ [GoogleOAuth] Encryption key is invalid:', {
        type: typeof encryptionKeyValue,
        length: encryptionKeyValue?.length || 0,
        minLength: 32,
      });
      throw new Error('Encryption key is invalid. ENCRYPTION_KEY must be at least 32 characters.');
    }

    // Ensure the key is exactly 32 bytes for AES-256-GCM
    // Use SHA-256 hash to derive a consistent 32-byte key from the secret
    let key: Buffer;
    try {
      key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
    } catch (hashError: any) {
      console.error('❌ [GoogleOAuth] Failed to derive key:', hashError);
      throw new Error('Failed to derive encryption key. Encryption key may be corrupted.');
    }

    if (!key || key.length !== 32) {
      throw new Error(`Invalid key length. Expected 32 bytes, got ${key?.length || 0}`);
    }
    
    try {
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      if (!decrypted || decrypted.length === 0) {
        throw new Error('Decrypted token is empty');
      }
      
      return decrypted;
    } catch (decryptError: any) {
      // Check for authentication tag verification failure
      const errorMessage = decryptError.message || String(decryptError);
      const isAuthTagError = errorMessage.includes('Unsupported state') || 
                             errorMessage.includes('unable to authenticate data') ||
                             errorMessage.includes('auth tag') ||
                             decryptError.code === 'ERR_CRYPTO_INVALID_TAG';
      
      if (isAuthTagError) {
        console.error('❌ [GoogleOAuth] Authentication tag verification failed:', {
          errorMessage,
          errorCode: decryptError.code,
        });
        throw new Error('Token authentication failed. The Google Drive connection token may be corrupted or encrypted with a different key. Please re-connect your Google Drive account.');
      }
      
      if (decryptError.message && decryptError.message.includes('Invalid key length')) {
        console.error('❌ [GoogleOAuth] Invalid key length error during decryption:', {
          keyLength: key?.length || 0,
          ivLength: iv?.length || 0,
          authTagLength: authTag?.length || 0,
          encryptionKeyValueLength: encryptionKeyValue?.length || 0,
        });
        throw new Error('Invalid key length. ENCRYPTION_KEY secret may be misconfigured. Please verify the secret is set correctly.');
      }
      throw decryptError;
    }
  } catch (error) {
    console.error('❌ [GoogleOAuth] Failed to decrypt token:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw error instanceof Error ? error : new Error('Failed to decrypt access token. Configuration error.');
  }
}

/**
 * Initiate Google Drive OAuth flow
 * 
 * Creates OAuth URL and state for user or organization connection
 */
export const googleOAuthInitiate = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, connectionType, userId, redirectUri } = request.data as {
        organizationId: string;
        connectionType: 'user' | 'organization';
        userId?: string;
        redirectUri?: string;
      };

      // Validate request
      if (!organizationId || !connectionType) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      // Validate organization access
      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      if (!orgDoc.exists) {
        throw new HttpsError('not-found', 'Organization not found');
      }

      // Check if user has permission to connect
      if (connectionType === 'organization') {
        const authToken = request.auth?.token;
        if (!authToken || authToken.organizationId !== organizationId) {
          throw new HttpsError('permission-denied', 'Only organization admins can connect Google Drive');
        }
        // Check for both 'admin' and 'ADMIN' role (case insensitive)
        const userRole = authToken.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'owner') {
          throw new HttpsError('permission-denied', 'Admin role required for organization Google Drive connection');
        }
      }

      // Get Google configuration from Firestore
      const config = await getGoogleConfig(organizationId);

      // Use provided redirectUri or default from config
      const finalRedirectUri = redirectUri || config.redirectUri;

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour as string

      // Store state in Firestore
      await db.collection('googleOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: finalRedirectUri,
        expiry: stateExpiry,
      });

      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        finalRedirectUri
      );

      // Generate OAuth URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: config.scopes,
        state: state,
        prompt: 'consent' // Force consent to get refresh token
      });

      console.log(`✅ [GoogleOAuth] Initiated OAuth flow for ${connectionType} connection in org ${organizationId}`);

      return {
        url: authUrl,
        state,
      };

    } catch (error) {
      console.error('❌ [GoogleOAuth] Error initiating OAuth:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to initiate OAuth');
    }
  }
);

/**
 * Refresh expired Google Drive access token
 */
export const googleOAuthRefresh = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId } = request.data as {
        connectionId: string;
        organizationId: string;
      };

      if (!connectionId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      // Get connection
      const connectionRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('googleConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      if (!connectionData.refreshToken) {
        throw new HttpsError('failed-precondition', 'No refresh token available');
      }

      // Get Google configuration
      const config = await getGoogleConfig(organizationId);

      // Decrypt refresh token
      const refreshToken = decryptToken(connectionData.refreshToken);

      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );

      // Set refresh token and refresh
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update connection with new tokens
      const encryptedAccessToken = encryptToken(credentials.access_token!);
      const encryptedRefreshToken = credentials.refresh_token ? encryptToken(credentials.refresh_token) : connectionData.refreshToken; // Keep existing if not provided
      
      await connectionRef.update({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: credentials.expiry_date ? Timestamp.fromMillis(credentials.expiry_date) : null,
        lastSyncedAt: Timestamp.now(),
      });

      console.log(`✅ [GoogleOAuth] Token refreshed for connection ${connectionId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [GoogleOAuth] Error refreshing token:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to refresh token');
    }
  }
);

/**
 * Revoke Google Drive connection
 */
export const googleRevokeAccess = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId } = request.data as {
        connectionId: string;
        organizationId: string;
      };

      if (!connectionId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      // Get connection
      const connectionRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('googleConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      // Try to decrypt access token - if it fails, we'll still mark as inactive
      let accessToken: string | null = null;
      let tokenDecryptionFailed = false;
      
      try {
        accessToken = decryptToken(connectionData.accessToken);
      } catch (decryptError: any) {
        const errorMessage = decryptError.message || String(decryptError);
        const isTokenCorrupted = errorMessage.includes('Token authentication failed') ||
                                 errorMessage.includes('corrupted or encrypted with a different key') ||
                                 errorMessage.includes('Invalid token format');
        
        if (isTokenCorrupted) {
          console.warn('⚠️ [GoogleOAuth] Cannot decrypt token for revocation - token is corrupted. Marking connection as inactive anyway.');
          tokenDecryptionFailed = true;
        } else {
          // Re-throw if it's a different type of error (key misconfiguration, etc.)
          throw decryptError;
        }
      }

      // Revoke token with Google (only if we successfully decrypted it)
      if (accessToken && !tokenDecryptionFailed) {
        try {
          const revokeResponse = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
          
          if (!revokeResponse.ok) {
            console.warn('⚠️ [GoogleOAuth] Google API returned error during revocation');
          }
        } catch (error) {
          console.warn('⚠️ [GoogleOAuth] Failed to revoke token with Google API:', error);
          // Continue anyway - we'll still mark as inactive
        }
      }

      // Mark connection as inactive (whether or not we could revoke with Google)
      await connectionRef.update({
        isActive: false,
        disconnectedAt: Timestamp.now(),
      });

      console.log(`✅ [GoogleOAuth] Connection marked as inactive for ${connectionId}${tokenDecryptionFailed ? ' (token was corrupted, could not revoke with Google)' : ''}`);

      return {
        success: true,
        tokenWasCorrupted: tokenDecryptionFailed,
        message: tokenDecryptionFailed 
          ? 'Connection disconnected. The token was corrupted and could not be revoked with Google, but the connection has been marked as inactive.'
          : 'Connection successfully revoked and disconnected.',
      };

    } catch (error) {
      console.error('❌ [GoogleOAuth] Error revoking access:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to revoke access');
    }
  }
);

/**
 * HTTP endpoint for Google Drive OAuth callback
 * This is called by Google after user authorizes the app
 */
export const googleOAuthCallback = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      // Handle OAuth error from Google
      if (error) {
        console.error('❌ [GoogleOAuth] OAuth error from Google:', error);
        return res.redirect('https://clipshowpro.web.app/integration-settings?google_error=authorization_failed');
      }

      if (!code || !state) {
        return res.redirect('https://clipshowpro.web.app/integration-settings?google_error=missing_parameters');
      }

      // Verify state and complete OAuth flow
      const stateDoc = await db.collection('googleOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateDoc.empty) {
        return res.redirect('https://clipshowpro.web.app/integration-settings?google_error=invalid_state');
      }

      const stateData = stateDoc.docs[0].data();
      
      // Exchange code for token (call internal function logic)
      const redirectUrl = await completeOAuthCallback(
        code as string,
        state as string,
        stateData
      );

      return res.redirect(redirectUrl);

    } catch (error) {
      console.error('❌ [GoogleOAuth] Error in callback handler:', error);
      return res.redirect('https://clipshowpro.web.app/integration-settings?google_error=callback_failed');
    }
  }
);

async function completeOAuthCallback(code: string, state: string, stateData: any) {
  try {
    const { organizationId, connectionType, userId, redirectUri } = stateData;

    // Get Google configuration
    const googleConfig = await getGoogleConfig(organizationId);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      googleConfig.clientId,
      googleConfig.clientSecret,
      redirectUri || googleConfig.redirectUri
    );

    // Exchange code for access token
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens || !tokens.access_token) {
      throw new Error('Token exchange succeeded but no access_token received');
    }

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const userInfo = userInfoResponse.data as { email: string; name: string; id?: string; picture?: string };

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined;

    // Create connection document
    const connectionData: any = {
      organizationId,
      type: connectionType,
      userId: userId || null,
      accountEmail: userInfo.email,
      accountName: userInfo.name,
      accountId: userInfo.id,
      accessToken: encryptedAccessToken,
      scopes: googleConfig.scopes,
      connectedBy: userId || 'system',
      isActive: true,
      connectedAt: Timestamp.now(),
    };

    // Only add refreshToken if it exists (Firestore doesn't accept undefined)
    if (encryptedRefreshToken) {
      connectionData.refreshToken = encryptedRefreshToken;
    }

    // Add expiry if available
    if (tokens.expiry_date) {
      connectionData.tokenExpiresAt = Timestamp.fromMillis(tokens.expiry_date);
    }

    const connectionRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('googleConnections')
      .add(connectionData);

    const connectionId = connectionRef.id;

    // Create or update integration record
    try {
      const integrationRecordRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('google-integration');

      // Check if record exists to preserve createdAt
      const existingRecord = await integrationRecordRef.get();
      const existingData = existingRecord.data();

      const integrationRecord = {
        id: 'google-integration',
        name: 'Google Drive Integration',
        type: 'google',
        enabled: true,
        organizationId: organizationId,
        accountName: userInfo.name,
        accountEmail: userInfo.email,
        credentials: {},
        settings: {},
        createdAt: existingData?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await integrationRecordRef.set(integrationRecord, { merge: true });
      console.log(`✅ [GoogleOAuth] Created/updated integration record for Google Drive`);
    } catch (recordError) {
      // Don't fail the whole OAuth flow if integration record creation fails
      console.warn('⚠️ [GoogleOAuth] Failed to create integration record:', recordError);
    }

    // Delete used state
    const stateDoc = await db.collection('googleOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateDoc.empty) {
      await stateDoc.docs[0].ref.delete();
    }

    console.log(`✅ [GoogleOAuth] Connection established for ${connectionType} connection in org ${organizationId}`);

    return 'https://clipshowpro.web.app/integration-settings?google_connected=true';

  } catch (error) {
    console.error('❌ [GoogleOAuth] Error completing callback:', error);
    throw error;
  }
}

