/**
 * Dropbox OAuth Functions
 * 
 * Handle OAuth flow for Dropbox connections
 * Supports both user-level and organization-level connections
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, verifyAuthToken, createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as crypto from 'crypto';
import { getDropboxConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';

import * as admin from 'firebase-admin';
import { encryptTokens } from '../integrations/encryption';

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
      const { organizationId, connectionType, userId, redirectUri, callbackUrl } = request.data as {
        organizationId: string;
        connectionType: 'user' | 'organization';
        userId?: string;
        redirectUri?: string;
        callbackUrl?: string;
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

      // The redirectUri for OAuth provider (Dropbox) should be the Firebase Function URL
      // The redirectUrl parameter from client is the client app URL where user will be redirected after OAuth completes
      // Use provided callbackUrl if available (for local dev), otherwise use production URL
      const oauthCallbackUrl = callbackUrl || 'https://us-central1-backbone-logic.cloudfunctions.net/dropboxOAuthCallbackHttp';
      // Use provided redirectUri as the client redirectUrl, or default
      const clientRedirectUrl = redirectUri || 'https://backbone-logic.web.app/integration-settings';

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour

      // Store state in Firestore
      // redirectUri: Firebase Function URL (for Dropbox OAuth callback - used in token exchange)
      // redirectUrl: Client app URL (for final redirect after OAuth completes)
      await db.collection('dropboxOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: oauthCallbackUrl, // Firebase Function URL for Dropbox to redirect to (used in token exchange)
        redirectUrl: clientRedirectUrl, // Client app URL for final redirect
        expiry: stateExpiry,
      });

      // Generate Dropbox OAuth URL
      // Use Firebase Function URL as redirect_uri for Dropbox
      const dropboxAuthBaseUrl = 'https://www.dropbox.com/oauth2/authorize';
      
      // Log the redirect URI being sent to Dropbox for debugging
      console.log(`🔍 [DropboxOAuth] Using redirect_uri: ${oauthCallbackUrl}`);
      console.log(`🔍 [DropboxOAuth] Make sure this EXACT URI is configured in Dropbox App Console`);
      
      const authUrlParams = new URLSearchParams({
        client_id: config.appKey,
        redirect_uri: oauthCallbackUrl, // Firebase Function URL
        response_type: 'code',
        state: state,
        token_access_type: 'offline', // Request refresh token
      });
      const authUrl = `${dropboxAuthBaseUrl}?${authUrlParams.toString()}`;

      console.log(`✅ [DropboxOAuth] Initiated OAuth flow for ${connectionType} connection in org ${organizationId}`);
      console.log(`🔍 [DropboxOAuth] Authorization URL (first 200 chars): ${authUrl.substring(0, 200)}...`);

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
              } catch { }
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
 * Callable endpoint for Dropbox OAuth callback
 * This is called by the frontend after redirect
 */
export const dropboxOAuthCallback = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { code, state } = request.data as { code: string; state: string };

      if (!code || !state) {
        throw new HttpsError('invalid-argument', 'Missing code or state parameters');
      }

      // Verify state and complete OAuth flow
      const stateDoc = await db.collection('dropboxOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateDoc.empty) {
        throw new HttpsError('not-found', 'Invalid or expired state parameter');
      }

      const stateData = stateDoc.docs[0].data();

      // Exchange code for token (call internal function logic)
      const result = await completeOAuthCallbackLogic(
        code,
        state,
        stateData
      );

      return {
        success: true,
        accountEmail: result.accountEmail,
        accountName: result.accountName,
        connected: true
      };

    } catch (error: any) {
      console.error('❌ [DropboxOAuth] Error in callable handler:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to complete Dropbox connection');
    }
  }
);

/**
 * Helper function to get redirect URL from state or return null
 */
async function getDropboxRedirectUrlFromState(state: string | undefined, errorType: string): Promise<string | null> {
  if (!state) return null;

  try {
    const stateDoc = await db.collection('dropboxOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateDoc.empty) {
      const stateData = stateDoc.docs[0].data();
      if (stateData.redirectUrl) {
        // Replace success param with error param, preserving the origin
        let errorRedirectUrl = stateData.redirectUrl
          .replace('dropbox_connected=true', `dropbox_error=${errorType}`)
          .replace('dropbox_connected=true&', `dropbox_error=${errorType}&`);
        // If no success param exists, append error param
        if (!errorRedirectUrl.includes('dropbox_error=') && !errorRedirectUrl.includes('dropbox_connected=')) {
          const separator = errorRedirectUrl.includes('?') ? '&' : '?';
          errorRedirectUrl = `${errorRedirectUrl}${separator}dropbox_error=${errorType}`;
        }
        return errorRedirectUrl;
      }
    }
  } catch (e) {
    console.warn('⚠️ [DropboxOAuth] Could not get redirect URL from state:', e);
  }

  return null;
}

/**
 * Return HTML error page when state is missing/expired
 */
function sendDropboxErrorPage(res: any, message: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OAuth Error</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #d32f2f; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <h1>OAuth Session Expired</h1>
      <p>${message}</p>
      <p>Please return to the application and try again.</p>
    </body>
    </html>
  `;
  res.status(400).send(html);
}

/**
 * HTTP endpoint for Dropbox OAuth callback
 * This is called by Dropbox after user authorizes the app
 */
export const dropboxOAuthCallbackHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      // Handle OAuth error from Dropbox
      if (error) {
        console.error('❌ [DropboxOAuth] OAuth error from Dropbox:', error);
        const errorRedirectUrl = await getDropboxRedirectUrlFromState(state as string | undefined, 'authorization_failed');
        if (errorRedirectUrl) {
          return res.redirect(errorRedirectUrl);
        }
        // If no redirect URL available, show error page
        return sendDropboxErrorPage(res, 'Dropbox authorization was denied or failed. Please try again.');
      }

      if (!code || !state) {
        const missingParamsRedirect = await getDropboxRedirectUrlFromState(state as string | undefined, 'missing_parameters');
        if (missingParamsRedirect) {
          return res.redirect(missingParamsRedirect);
        }
        // If no redirect URL available, show error page
        return sendDropboxErrorPage(res, 'OAuth callback is missing required parameters. Please try again.');
      }

      // Verify state and complete OAuth flow
      // Check unified oauthStates collection first (new system), then dropboxOAuthStates (legacy)
      let stateDoc = await db.collection('oauthStates').doc(state as string).get();
      let stateData: any = null;
      let isUnifiedOAuth = false;

      if (stateDoc.exists) {
        stateData = stateDoc.data();
        isUnifiedOAuth = true;
        console.log(`🔗 [DropboxOAuth] Found state in unified oauthStates collection`);
      } else {
        // Fallback to legacy dropboxOAuthStates collection
        const legacyStateQuery = await db.collection('dropboxOAuthStates')
          .where('state', '==', state)
          .limit(1)
          .get();
        
        if (!legacyStateQuery.empty) {
          stateData = legacyStateQuery.docs[0].data();
          console.log(`🔗 [DropboxOAuth] Found state in legacy dropboxOAuthStates collection`);
        }
      }

      if (!stateData) {
        // State expired or invalid - show error page instead of redirecting to production
        return sendDropboxErrorPage(res, 'OAuth session has expired. Please return to the application and try connecting again.');
      }

      console.log(`🔗 [DropboxOAuth] Retrieved state data, redirectUrl: ${stateData.redirectUrl || 'not found'}`);

      // redirectUrl must be present in state - if not, this is a configuration error
      if (!stateData.redirectUrl) {
        console.error('❌ [DropboxOAuth] redirectUrl missing from state document - this should not happen');
        return sendDropboxErrorPage(res, 'OAuth configuration error. Please contact support.');
      }

      // Exchange code for token (call internal function logic)
      // For unified OAuth, we need to provide organizationId and userId from state
      const callbackStateData = isUnifiedOAuth ? {
        ...stateData,
        organizationId: stateData.organizationId,
        userId: stateData.userId,
        connectionType: 'organization', // Default for unified OAuth
        redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/dropboxOAuthCallbackHttp',
        redirectUrl: stateData.redirectUrl
      } : stateData;

      const result = await completeOAuthCallbackLogic(
        code as string,
        state as string,
        callbackStateData
      );

      const finalRedirectUrl = result.redirectUrl || stateData.redirectUrl.replace('dropbox_error=', 'dropbox_connected=true').replace(/dropbox_error=[^&]*/, 'dropbox_connected=true');
      console.log(`🔗 [DropboxOAuth] Redirecting to: ${finalRedirectUrl}`);
      return res.redirect(finalRedirectUrl);

    } catch (error: any) {
      console.error('❌ [DropboxOAuth] Error in callback handler:', error);

      const errorMessage = error?.message || 'unknown_error';
      // Create a safe error code that includes details but is URL safe
      const safeErrorDetails = encodeURIComponent(errorMessage.substring(0, 200));
      const errorParam = `callback_failed&dropbox_error_details=${safeErrorDetails}`;

      const callbackFailedRedirect = await getDropboxRedirectUrlFromState(req.query.state as string | undefined, errorParam);
      if (callbackFailedRedirect) {
        return res.redirect(callbackFailedRedirect);
      }
      // If no redirect URL available, show error page
      return sendDropboxErrorPage(res, `An error occurred during OAuth callback: ${errorMessage}`);
    }
  }
);

async function completeOAuthCallbackLogic(code: string, state: string, stateData: any) {
  try {
    const { organizationId, connectionType, userId, redirectUri, redirectUrl } = stateData;

    // Get Dropbox configuration
    const dropboxConfig = await getDropboxConfig(organizationId);

    // Exchange code for access token using Dropbox API
    const https = require('https');
    const querystring = require('querystring');

    // Use redirectUri from state (Firebase Function URL) for token exchange
    const tokenExchangeRedirectUri = redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/dropboxOAuthCallbackHttp';
    const tokenData = querystring.stringify({
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: tokenExchangeRedirectUri,
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
            } catch { }
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

    // ALSO save to the unified cloudIntegrations location for compatibility with existing UI
    try {
      const unifiedIntegrationRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('dropbox');

      // Encrypt tokens using the shared binary-base64 format for unified access
      const unifiedTokens = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: tokenResponse.expires_in ? Date.now() + (tokenResponse.expires_in * 1000) : null
      };
      const unifiedEncryptedTokens = encryptTokens(unifiedTokens);

      // Prepare unified document format
      const unifiedDoc = {
        userId: userId || 'system',
        organizationId: organizationId,
        provider: 'dropbox',
        accountEmail: userInfoResponse.email || '',
        accountName: userInfoResponse.name?.display_name || userInfoResponse.name?.given_name || 'Dropbox User',
        accountId: userInfoResponse.account_id,
        // We store both the connection ID and the unified encrypted tokens
        connectionId: connectionId,
        encryptedTokens: unifiedEncryptedTokens, // CRITICAL: Added this for refreshDropboxAccessToken
        isActive: true,
        connectionMethod: 'oauth',
        connectedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        expiresAt: tokenResponse.expires_in ? Timestamp.fromMillis(Date.now() + tokenResponse.expires_in * 1000) : null
      };

      await unifiedIntegrationRef.set(unifiedDoc, { merge: true });
      console.log(`✅ [DropboxOAuth] Saved to cloudIntegrations/dropbox with encryptedTokens for organization ${organizationId}`);
    } catch (unifiedError) {
      console.warn('⚠️ [DropboxOAuth] Failed to save to cloudIntegrations:', unifiedError);
    }

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
    console.log(`🔗 [DropboxOAuth] redirectUrl from stateData: ${stateData.redirectUrl || 'not provided'}`);

    // Use redirect URL from state, or default to backbone-logic.web.app
    // The redirectUrl in state is the client app URL where the user should be redirected after OAuth
    // This is different from redirectUri which is used for token exchange
    const finalRedirectUrl = stateData.redirectUrl || 'https://backbone-logic.web.app/integration-settings?dropbox_connected=true';

    // Ensure the redirect URL has the success parameter
    let redirectUrlWithParam = finalRedirectUrl;
    if (!redirectUrlWithParam.includes('dropbox_connected=')) {
      const separator = redirectUrlWithParam.includes('?') ? '&' : '?';
      redirectUrlWithParam = `${redirectUrlWithParam}${separator}dropbox_connected=true`;
    } else {
      // Replace any existing dropbox_error with dropbox_connected
      redirectUrlWithParam = redirectUrlWithParam.replace(/dropbox_error=[^&]*/g, 'dropbox_connected=true');
    }

    console.log(`🔗 [DropboxOAuth] Final redirect URL: ${redirectUrlWithParam}`);

    return {
      success: true,
      accountEmail: userInfoResponse.email || '',
      accountName: userInfoResponse.name?.display_name || '',
      redirectUrl: redirectUrlWithParam
    };

  } catch (error) {
    console.error('❌ [DropboxOAuth] Error completing callback:', error);
    throw error;
  }
}


/**
 * Initiate Dropbox OAuth flow (HTTP version)
 * Used by client-side redirect flow
 */
export const dropboxOAuthInitiateHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        setCorsHeaders(req, res);
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '3600');
        res.status(200).send('');
        return;
      }

      // Set CORS headers
      setCorsHeaders(req, res);

      // Verify user authentication
      let userId: string;
      let organizationId: string;

      try {
        const authResult = await verifyAuthToken(req);
        userId = authResult.userId;
        organizationId = authResult.organizationId;
      } catch (authError) {
        res.status(401).json(createErrorResponse('Authentication required'));
        return;
      }

      const { redirectUri, callbackUrl } = req.body;
      const connectionType = 'organization'; // Default to organization-level connection

      console.log(`🚀 [DropboxOAuth] Initiating OAuth flow (HTTP) for org: ${organizationId} by user: ${userId}`);

      // Get Dropbox configuration from Firestore
      const config = await getDropboxConfig(organizationId);

      // The redirectUri for OAuth provider should be the Firebase Function URL
      const oauthCallbackUrl = callbackUrl || 'https://us-central1-backbone-logic.cloudfunctions.net/dropboxOAuthCallbackHttp';

      if (!redirectUri) {
        res.status(400).json(createErrorResponse('redirectUri is required'));
        return;
      }
      const clientRedirectUrl = redirectUri;

      // Generate state parameter
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour

      // Store state
      await db.collection('dropboxOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: oauthCallbackUrl,
        redirectUrl: clientRedirectUrl,
        expiry: stateExpiry,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Generate Dropbox OAuth URL
      const dropboxAuthBaseUrl = 'https://www.dropbox.com/oauth2/authorize';
      
      // Log the redirect URI being sent to Dropbox for debugging
      console.log(`🔍 [DropboxOAuth] Using redirect_uri: ${oauthCallbackUrl}`);
      console.log(`🔍 [DropboxOAuth] Make sure this EXACT URI is configured in Dropbox App Console`);
      
      const authUrlParams = new URLSearchParams({
        client_id: config.appKey,
        redirect_uri: oauthCallbackUrl,
        response_type: 'code',
        state: state,
        token_access_type: 'offline',
      });
      const authUrl = `${dropboxAuthBaseUrl}?${authUrlParams.toString()}`;

      console.log(`✅ [DropboxOAuth] Initiated OAuth flow (HTTP) successfully`);
      console.log(`🔍 [DropboxOAuth] Authorization URL (first 200 chars): ${authUrl.substring(0, 200)}...`);

      res.status(200).json(createSuccessResponse({
        authUrl,
        state,
      }));

    } catch (error: any) {
      console.error('❌ [DropboxOAuth] Error initiating OAuth (HTTP):', error);
      const statusCode = error.code === 'permission-denied' ? 403 : 500;
      res.status(statusCode).json(createErrorResponse('Failed to initiate OAuth', error.message));
    }
  }
);
