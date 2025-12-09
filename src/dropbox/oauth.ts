/**
 * Dropbox OAuth Functions
 * 
 * Handle OAuth flow for Dropbox connections
 * Supports both user-level and organization-level connections
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as crypto from 'crypto';
import { getDropboxConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';

/**
 * Encrypt sensitive token data
 */
function encryptToken(text: string): string {
  const algorithm = 'aes-256-gcm';
  
  let encryptionKeyValue: string;
  try {
    encryptionKeyValue = getEncryptionKey();
  } catch (keyError) {
    console.error('❌ [DropboxOAuth] Failed to get encryption key:', keyError);
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
  }

  if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
    console.error('❌ [DropboxOAuth] Encryption key is invalid:', {
      type: typeof encryptionKeyValue,
      length: encryptionKeyValue?.length || 0,
      minLength: 32,
    });
    throw new Error('Encryption key is invalid. ENCRYPTION_KEY must be at least 32 characters.');
  }

  let key: Buffer;
  try {
    key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
  } catch (hashError: any) {
    console.error('❌ [DropboxOAuth] Failed to derive key:', hashError);
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
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (cipherError: any) {
    if (cipherError.message && cipherError.message.includes('Invalid key length')) {
      console.error('❌ [DropboxOAuth] Invalid key length error during encryption:', {
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
    
    let encryptionKeyValue: string;
    try {
      encryptionKeyValue = getEncryptionKey();
    } catch (keyError) {
      console.error('❌ [DropboxOAuth] Failed to get encryption key:', keyError);
      throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
    }

    if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
      console.error('❌ [DropboxOAuth] Encryption key is invalid:', {
        type: typeof encryptionKeyValue,
        length: encryptionKeyValue?.length || 0,
        minLength: 32,
      });
      throw new Error('Encryption key is invalid. ENCRYPTION_KEY must be at least 32 characters.');
    }

    let key: Buffer;
    try {
      key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
    } catch (hashError: any) {
      console.error('❌ [DropboxOAuth] Failed to derive key:', hashError);
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
      const errorMessage = decryptError.message || String(decryptError);
      const isAuthTagError = errorMessage.includes('Unsupported state') || 
                             errorMessage.includes('unable to authenticate data') ||
                             errorMessage.includes('auth tag') ||
                             decryptError.code === 'ERR_CRYPTO_INVALID_TAG';
      
      if (isAuthTagError) {
        console.error('❌ [DropboxOAuth] Authentication tag verification failed:', {
          errorMessage,
          errorCode: decryptError.code,
        });
        throw new Error('Token authentication failed. The Dropbox connection token may be corrupted or encrypted with a different key. Please re-connect your Dropbox account.');
      }
      
      if (decryptError.message && decryptError.message.includes('Invalid key length')) {
        console.error('❌ [DropboxOAuth] Invalid key length error during decryption:', {
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
    console.error('❌ [DropboxOAuth] Failed to decrypt token:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw error instanceof Error ? error : new Error('Failed to decrypt access token. Configuration error.');
  }
}

/**
 * Initiate Dropbox OAuth flow
 * 
 * Creates OAuth URL and state for user or organization connection
 */
export const dropboxOAuthInitiate = onCall(
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
          throw new HttpsError('permission-denied', 'Only organization admins can connect Dropbox');
        }
        const userRole = authToken.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'owner') {
          throw new HttpsError('permission-denied', 'Admin role required for organization Dropbox connection');
        }
      }

      // Get Dropbox configuration from Firestore
      const config = await getDropboxConfig(organizationId);

      // Use provided redirectUri or default from config
      const finalRedirectUri = redirectUri || config.redirectUri;

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour

      // Store state in Firestore
      await db.collection('dropboxOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: finalRedirectUri,
        expiry: stateExpiry,
      });

      // Generate Dropbox OAuth URL
      const dropboxAuthBaseUrl = 'https://www.dropbox.com/oauth2/authorize';
      const authUrlParams = new URLSearchParams({
        client_id: config.appKey,
        redirect_uri: finalRedirectUri,
        response_type: 'code',
        state: state,
        token_access_type: 'offline', // Request refresh token
      });
      const authUrl = `${dropboxAuthBaseUrl}?${authUrlParams.toString()}`;

      console.log(`✅ [DropboxOAuth] Initiated OAuth flow for ${connectionType} connection in org ${organizationId}`);

      return {
        url: authUrl,
        state,
      };

    } catch (error) {
      console.error('❌ [DropboxOAuth] Error initiating OAuth:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to initiate OAuth');
    }
  }
);

/**
 * Refresh expired Dropbox access token
 */
export const dropboxOAuthRefresh = onCall(
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
        .collection('dropboxConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      if (!connectionData.refreshToken) {
        throw new HttpsError('failed-precondition', 'No refresh token available');
      }

      // Get Dropbox configuration
      const config = await getDropboxConfig(organizationId);

      // Decrypt refresh token
      const refreshToken = decryptToken(connectionData.refreshToken);

      // Refresh token using Dropbox API
      const https = require('https');
      const querystring = require('querystring');
      
      const tokenData = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.appKey,
        client_secret: config.appSecret
      });

      const tokenResponse = await new Promise<any>((resolve, reject) => {
        const req = https.request({
          hostname: 'api.dropboxapi.com',
          path: '/oauth2/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(tokenData)
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(data));
              } catch (parseError) {
                reject(new Error(`Failed to parse token response: ${parseError}`));
              }
            } else {
              let errorMessage = `Token refresh failed: ${res.statusCode}`;
              try {
                const errorData = JSON.parse(data);
                if (errorData.error_description) {
                  errorMessage = errorData.error_description;
                }
              } catch {}
              reject(new Error(errorMessage));
            }
          });
        });
        
        req.on('error', (error: any) => {
          reject(error);
        });
        
        req.write(tokenData);
        req.end();
      });

      if (!tokenResponse.access_token) {
        throw new HttpsError('internal', 'Token refresh failed: No access token received');
      }

      // Update connection with new tokens
      const encryptedAccessToken = encryptToken(tokenResponse.access_token);
      const encryptedRefreshToken = tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : connectionData.refreshToken;
      
      await connectionRef.update({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokenResponse.expires_in ? Timestamp.fromMillis(Date.now() + tokenResponse.expires_in * 1000) : null,
        lastSyncedAt: Timestamp.now(),
      });

      console.log(`✅ [DropboxOAuth] Token refreshed for connection ${connectionId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [DropboxOAuth] Error refreshing token:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to refresh token');
    }
  }
);

/**
 * Revoke Dropbox connection
 */
export const dropboxRevokeAccess = onCall(
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
        .collection('dropboxConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      // Try to decrypt access token for revocation
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
          console.warn('⚠️ [DropboxOAuth] Cannot decrypt token for revocation - token is corrupted. Marking connection as inactive anyway.');
          tokenDecryptionFailed = true;
        } else {
          throw decryptError;
        }
      }

      // Revoke token with Dropbox (only if we successfully decrypted it)
      if (accessToken && !tokenDecryptionFailed) {
        try {
          // Dropbox doesn't have a direct revoke endpoint, but we can mark as inactive
          // The token will expire naturally
          console.log('✅ [DropboxOAuth] Dropbox tokens will expire naturally');
        } catch (error) {
          console.warn('⚠️ [DropboxOAuth] Failed to revoke token with Dropbox API:', error);
        }
      }

      // Mark connection as inactive
      await connectionRef.update({
        isActive: false,
        disconnectedAt: Timestamp.now(),
      });

      console.log(`✅ [DropboxOAuth] Connection marked as inactive for ${connectionId}${tokenDecryptionFailed ? ' (token was corrupted)' : ''}`);

      return {
        success: true,
        tokenWasCorrupted: tokenDecryptionFailed,
        message: tokenDecryptionFailed 
          ? 'Connection disconnected. The token was corrupted, but the connection has been marked as inactive.'
          : 'Connection successfully disconnected.',
      };

    } catch (error) {
      console.error('❌ [DropboxOAuth] Error revoking access:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to revoke access');
    }
  }
);

/**
 * HTTP endpoint for Dropbox OAuth callback
 * This is called by Dropbox after user authorizes the app
 */
export const dropboxOAuthCallback = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error('❌ [DropboxOAuth] OAuth error from Dropbox:', error);
        return res.redirect('https://clipshowpro.web.app/integration-settings?dropbox_error=authorization_failed');
      }

      if (!code || !state) {
        return res.redirect('https://clipshowpro.web.app/integration-settings?dropbox_error=missing_parameters');
      }

      // Verify state and complete OAuth flow
      const stateDoc = await db.collection('dropboxOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateDoc.empty) {
        return res.redirect('https://clipshowpro.web.app/integration-settings?dropbox_error=invalid_state');
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
      console.error('❌ [DropboxOAuth] Error in callback handler:', error);
      return res.redirect('https://clipshowpro.web.app/integration-settings?dropbox_error=callback_failed');
    }
  }
);

async function completeOAuthCallback(code: string, state: string, stateData: any) {
  try {
    const { organizationId, connectionType, userId, redirectUri } = stateData;

    // Get Dropbox configuration
    const dropboxConfig = await getDropboxConfig(organizationId);

    // Exchange code for access token using Dropbox API
    const https = require('https');
    const querystring = require('querystring');
    
    const tokenData = querystring.stringify({
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri || dropboxConfig.redirectUri,
      client_id: dropboxConfig.appKey,
      client_secret: dropboxConfig.appSecret
    });

    const tokenResponse = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.dropboxapi.com',
        path: '/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenData)
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(new Error(`Failed to parse token response: ${parseError}`));
            }
          } else {
            let errorMessage = `Token exchange failed: ${res.statusCode}`;
            try {
              const errorData = JSON.parse(data);
              if (errorData.error_description) {
                errorMessage = errorData.error_description;
              }
            } catch {}
            reject(new Error(errorMessage));
          }
        });
      });
      
      req.on('error', (error: any) => {
        reject(error);
      });
      
      req.write(tokenData);
      req.end();
    });

    if (!tokenResponse || !tokenResponse.access_token) {
      throw new Error('Token exchange succeeded but no access_token received');
    }

    // Get user info using Dropbox API
    const userInfoResponse = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.dropboxapi.com',
        path: '/2/users/get_current_account',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`,
          'Content-Type': 'application/json'
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(new Error(`Failed to parse user info response: ${parseError}`));
            }
          } else {
            reject(new Error(`Failed to get user info: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (error: any) => {
        reject(error);
      });
      
      req.write(JSON.stringify({}));
      req.end();
    });

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : undefined;

    // Create connection document
    const connectionData: any = {
      organizationId,
      type: connectionType,
      userId: userId || null,
      accountEmail: userInfoResponse.email || '',
      accountName: userInfoResponse.name?.display_name || userInfoResponse.name?.given_name || '',
      accountId: userInfoResponse.account_id,
      accessToken: encryptedAccessToken,
      scopes: ['files.content.read', 'files.content.write', 'files.metadata.read'],
      connectedBy: userId || 'system',
      isActive: true,
      connectedAt: Timestamp.now(),
    };

    // Only add refreshToken if it exists
    if (encryptedRefreshToken) {
      connectionData.refreshToken = encryptedRefreshToken;
    }

    // Add expiry if available
    if (tokenResponse.expires_in) {
      connectionData.tokenExpiresAt = Timestamp.fromMillis(Date.now() + tokenResponse.expires_in * 1000);
    }

    const connectionRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('dropboxConnections')
      .add(connectionData);

    const connectionId = connectionRef.id;

    // Create or update integration record
    try {
      const integrationRecordRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('dropbox-integration');

      const existingRecord = await integrationRecordRef.get();
      const existingData = existingRecord.data();

      const integrationRecord = {
        id: 'dropbox-integration',
        name: 'Dropbox Integration',
        type: 'dropbox',
        enabled: true,
        organizationId: organizationId,
        accountName: userInfoResponse.name?.display_name || '',
        accountEmail: userInfoResponse.email || '',
        credentials: {},
        settings: {},
        createdAt: existingData?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await integrationRecordRef.set(integrationRecord, { merge: true });
      console.log(`✅ [DropboxOAuth] Created/updated integration record for Dropbox`);
    } catch (recordError) {
      console.warn('⚠️ [DropboxOAuth] Failed to create integration record:', recordError);
    }

    // Delete used state
    const stateDoc = await db.collection('dropboxOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateDoc.empty) {
      await stateDoc.docs[0].ref.delete();
    }

    console.log(`✅ [DropboxOAuth] Connection established for ${connectionType} connection in org ${organizationId}`);

    return 'https://clipshowpro.web.app/integration-settings?dropbox_connected=true';

  } catch (error) {
    console.error('❌ [DropboxOAuth] Error completing callback:', error);
    throw error;
  }
}

