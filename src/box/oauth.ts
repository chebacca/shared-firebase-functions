/**
 * Box OAuth Functions
 * 
 * Handle OAuth flow for Box connections
 * Supports both user-level and organization-level connections
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, verifyAuthToken, createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as crypto from 'crypto';
import { getBoxConfig } from './config';
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
    console.error('❌ [BoxOAuth] Failed to get encryption key:', keyError);
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
  }

  if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
    console.error('❌ [BoxOAuth] Encryption key is invalid:', {
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
    console.error('❌ [BoxOAuth] Failed to derive key:', hashError);
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
      console.error('❌ [BoxOAuth] Invalid key length error during encryption:', {
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
      console.error('❌ [BoxOAuth] Failed to get encryption key:', keyError);
      throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
    }

    if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
      console.error('❌ [BoxOAuth] Encryption key is invalid:', {
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
      console.error('❌ [BoxOAuth] Failed to derive key:', hashError);
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
        console.error('❌ [BoxOAuth] Authentication tag verification failed:', {
          errorMessage,
          errorCode: decryptError.code,
        });
        throw new Error('Token authentication failed. The Box connection token may be corrupted or encrypted with a different key. Please re-connect your Box account.');
      }

      if (decryptError.message && decryptError.message.includes('Invalid key length')) {
        console.error('❌ [BoxOAuth] Invalid key length error during decryption:', {
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
    console.error('❌ [BoxOAuth] Failed to decrypt token:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw error instanceof Error ? error : new Error('Failed to decrypt access token. Configuration error.');
  }
}

/**
 * Initiate Box OAuth flow
 * 
 * Creates OAuth URL and state for user or organization connection
 */
export const boxOAuthInitiate = onCall(
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
          throw new HttpsError('permission-denied', 'Only organization admins can connect Box');
        }
        const userRole = authToken.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'owner') {
          throw new HttpsError('permission-denied', 'Admin role required for organization Box connection');
        }
      }

      // Get Box configuration from Firestore
      const config = await getBoxConfig(organizationId);

      // The redirectUri for OAuth provider (Box) should be the unified OAuth callback URL
      // Use unified callback to match the unified OAuth system (handleOAuthCallback)
      const oauthCallbackUrl = callbackUrl || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback';
      // Use provided redirectUri as the client redirectUrl, or throw error if not provided
      // Client MUST provide redirectUri to ensure correct dev/prod handling
      if (!redirectUri) {
        throw new HttpsError('invalid-argument', 'redirectUri is required. Client must provide the redirect URL based on current environment.');
      }
      const clientRedirectUrl = redirectUri;

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour

      // Store state in Firestore
      // redirectUri: Firebase Function URL (for Box OAuth callback - used in token exchange)
      // redirectUrl: Client app URL (for final redirect after OAuth completes)
      await db.collection('boxOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: oauthCallbackUrl, // Firebase Function URL for Box to redirect to (used in token exchange)
        redirectUrl: clientRedirectUrl, // Client app URL for final redirect
        expiry: stateExpiry,
      });

      // Generate Box OAuth URL manually (avoiding SDK protobuf issues)
      // Use Firebase Function URL as redirect_uri for Box
      // CRITICAL: Box only supports ONE scope at a time. If config.scope contains multiple scopes,
      // use only root_readwrite (it includes read access)
      let scope = config.scope || 'root_readwrite';
      if (scope.includes(' ')) {
        // Multiple scopes detected - Box doesn't support this
        if (scope.includes('root_readwrite')) {
          scope = 'root_readwrite'; // Use the more permissive scope
        } else {
          scope = scope.split(' ')[0]; // Use first scope as fallback
        }
        console.log(`⚠️ [BoxOAuth] Multiple scopes detected, using single scope: ${scope}`);
      }

      const boxAuthBaseUrl = 'https://account.box.com/api/oauth2/authorize';
      const authUrlParams = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: oauthCallbackUrl, // Firebase Function URL
        state: state,
        scope: scope, // Single scope only
      });
      const authUrl = `${boxAuthBaseUrl}?${authUrlParams.toString()}`;

      console.log(`✅ [BoxOAuth] Initiated OAuth flow for ${connectionType} connection in org ${organizationId}`);

      return {
        url: authUrl,
        state,
      };

    } catch (error) {
      console.error('❌ [BoxOAuth] Error initiating OAuth:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to initiate OAuth');
    }
  }
);

/**
 * Refresh expired Box access token
 */
export const boxOAuthRefresh = onCall(
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
        .collection('boxConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      if (!connectionData.refreshToken) {
        throw new HttpsError('failed-precondition', 'No refresh token available');
      }

      // Get Box configuration
      const config = await getBoxConfig(organizationId);

      // Decrypt refresh token
      const refreshToken = decryptToken(connectionData.refreshToken);

      // Box SDK for token refresh
      const BoxSDK = require('box-node-sdk');
      const boxSDK = new BoxSDK({
        clientID: config.clientId,
        clientSecret: config.clientSecret
      });

      // Refresh token
      const tokenInfo = await boxSDK.getTokensRefreshGrant(refreshToken);

      if (!tokenInfo.accessToken) {
        throw new HttpsError('internal', 'Token refresh failed: No access token received');
      }

      // Update connection with new tokens
      const encryptedAccessToken = encryptToken(tokenInfo.accessToken);
      const encryptedRefreshToken = tokenInfo.refreshToken ? encryptToken(tokenInfo.refreshToken) : connectionData.refreshToken;

      await connectionRef.update({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokenInfo.expiresAt ? Timestamp.fromMillis(tokenInfo.expiresAt) : null,
        lastSyncedAt: Timestamp.now(),
      });

      console.log(`✅ [BoxOAuth] Token refreshed for connection ${connectionId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [BoxOAuth] Error refreshing token:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to refresh token');
    }
  }
);

/**
 * Revoke Box connection
 */
export const boxRevokeAccess = onCall(
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
        .collection('boxConnections')
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
          console.warn('⚠️ [BoxOAuth] Cannot decrypt token for revocation - token is corrupted. Marking connection as inactive anyway.');
          tokenDecryptionFailed = true;
        } else {
          throw decryptError;
        }
      }

      // Revoke token with Box (only if we successfully decrypted it)
      if (accessToken && !tokenDecryptionFailed) {
        try {
          // Box doesn't have a direct revoke endpoint, but we can mark as inactive
          // The token will expire naturally
          console.log('✅ [BoxOAuth] Box tokens will expire naturally');
        } catch (error) {
          console.warn('⚠️ [BoxOAuth] Failed to revoke token with Box API:', error);
        }
      }

      // Mark connection as inactive
      await connectionRef.update({
        isActive: false,
        disconnectedAt: Timestamp.now(),
      });

      console.log(`✅ [BoxOAuth] Connection marked as inactive for ${connectionId}${tokenDecryptionFailed ? ' (token was corrupted)' : ''}`);

      return {
        success: true,
        tokenWasCorrupted: tokenDecryptionFailed,
        message: tokenDecryptionFailed
          ? 'Connection disconnected. The token was corrupted, but the connection has been marked as inactive.'
          : 'Connection successfully disconnected.',
      };

    } catch (error) {
      console.error('❌ [BoxOAuth] Error revoking access:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to revoke access');
    }
  }
);

/**
 * Callable endpoint for Box OAuth callback
 * This is called by the frontend after redirect
 */
export const boxOAuthCallback = onCall(
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
      const stateDoc = await db.collection('boxOAuthStates')
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
      console.error('❌ [BoxOAuth] Error in callable handler:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to complete Box connection');
    }
  }
);

/**
 * Helper function to get redirect URL from state or return error page
 */
async function getRedirectUrlFromState(state: string | undefined, errorType: string): Promise<string | null> {
  if (!state) return null;

  try {
    const stateDoc = await db.collection('boxOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateDoc.empty) {
      const stateData = stateDoc.docs[0].data();
      if (stateData.redirectUrl) {
        // Replace success param with error param, preserving the origin
        let errorRedirectUrl = stateData.redirectUrl
          .replace('box_connected=true', `box_error=${errorType}`)
          .replace('box_connected=true&', `box_error=${errorType}&`);
        // If no success param exists, append error param
        if (!errorRedirectUrl.includes('box_error=') && !errorRedirectUrl.includes('box_connected=')) {
          const separator = errorRedirectUrl.includes('?') ? '&' : '?';
          errorRedirectUrl = `${errorRedirectUrl}${separator}box_error=${errorType}`;
        }
        return errorRedirectUrl;
      }
    }
  } catch (e) {
    console.warn('⚠️ [BoxOAuth] Could not get redirect URL from state:', e);
  }

  return null;
}

/**
 * Return HTML error page when state is missing/expired
 */
function sendErrorPage(res: any, message: string) {
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
 * HTTP endpoint for Box OAuth callback (server-side redirect)
 * This is called by Box after user authorizes the app
 */
export const boxOAuthCallbackHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      // Handle OAuth error from Box
      if (error) {
        console.error('❌ [BoxOAuth] OAuth error from Box:', error);
        const errorRedirectUrl = await getRedirectUrlFromState(state as string | undefined, 'authorization_failed');
        if (errorRedirectUrl) {
          return res.redirect(errorRedirectUrl);
        }
        // If no redirect URL available, show error page
        return sendErrorPage(res, 'Box authorization was denied or failed. Please try again.');
      }

      if (!code || !state) {
        const missingParamsRedirect = await getRedirectUrlFromState(state as string | undefined, 'missing_parameters');
        if (missingParamsRedirect) {
          return res.redirect(missingParamsRedirect);
        }
        // If no redirect URL available, show error page
        return sendErrorPage(res, 'OAuth callback is missing required parameters. Please try again.');
      }

      // Verify state and complete OAuth flow
      const stateDoc = await db.collection('boxOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateDoc.empty) {
        // State expired or invalid - show error page instead of redirecting to production
        return sendErrorPage(res, 'OAuth session has expired. Please return to the application and try connecting again.');
      }

      const stateData = stateDoc.docs[0].data();
      console.log(`🔗 [BoxOAuth] Retrieved state data, redirectUrl: ${stateData.redirectUrl || 'not found'}`);

      // redirectUrl must be present in state - if not, this is a configuration error
      if (!stateData.redirectUrl) {
        console.error('❌ [BoxOAuth] redirectUrl missing from state document - this should not happen');
        return sendErrorPage(res, 'OAuth configuration error. Please contact support.');
      }

      // Exchange code for token (call internal function logic)
      const result = await completeOAuthCallbackLogic(
        code as string,
        state as string,
        stateData
      );

      const finalRedirectUrl = result.redirectUrl || stateData.redirectUrl.replace('box_error=', 'box_connected=true').replace(/box_error=[^&]*/, 'box_connected=true');
      console.log(`🔗 [BoxOAuth] Redirecting to: ${finalRedirectUrl}`);
      return res.redirect(finalRedirectUrl);

    } catch (error: any) {
      console.error('❌ [BoxOAuth] Error in callback handler:', error);
      console.error('❌ [BoxOAuth] Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        query: req.query
      });

      const errorMessage = error?.message || 'unknown_error';
      const safeErrorDetails = encodeURIComponent(errorMessage.substring(0, 200));
      const errorParam = `callback_failed&box_error_details=${safeErrorDetails}`;

      const callbackFailedRedirect = await getRedirectUrlFromState(req.query.state as string | undefined, errorParam);
      if (callbackFailedRedirect) {
        console.log(`🔗 [BoxOAuth] Redirecting to error URL: ${callbackFailedRedirect}`);
        return res.redirect(callbackFailedRedirect);
      }
      // If no redirect URL available, show error page
      return sendErrorPage(res, `An error occurred during OAuth callback: ${errorMessage}`);
    }
  }
);

async function completeOAuthCallbackLogic(code: string, state: string, stateData: any) {
  try {
    const { organizationId, connectionType, userId, redirectUri, redirectUrl } = stateData;

    if (!organizationId) {
      throw new Error('Missing organizationId in state data');
    }

    console.log(`🔍 [BoxOAuth] Completing callback for org: ${organizationId}, connectionType: ${connectionType}`);

    // Get Box configuration
    const boxConfig = await getBoxConfig(organizationId);

    if (!boxConfig || !boxConfig.clientId || !boxConfig.clientSecret) {
      throw new Error(`Box configuration not found or incomplete for organization ${organizationId}`);
    }

    // Box SDK for token exchange
    const BoxSDK = require('box-node-sdk');
    const boxSDK = new BoxSDK({
      clientID: boxConfig.clientId,
      clientSecret: boxConfig.clientSecret
    });

    // Exchange code for access token
    // Use redirectUri from state (Firebase Function URL) for token exchange
    // Use unified callback to match the unified OAuth system
    const tokenExchangeRedirectUri = redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback';
    console.log(`🔍 [BoxOAuth] Exchanging code for token, redirectUri: ${tokenExchangeRedirectUri}`);

    let tokenInfo: any;
    try {
      tokenInfo = await boxSDK.getTokensAuthorizationCodeGrant(code, {
        redirectURI: tokenExchangeRedirectUri
      });
    } catch (tokenError: any) {
      console.error('❌ [BoxOAuth] Token exchange failed:', tokenError);
      throw new Error(`Token exchange failed: ${tokenError?.message || tokenError}`);
    }

    if (!tokenInfo || !tokenInfo.accessToken) {
      throw new Error('Token exchange succeeded but no access_token received');
    }

    // Get user info
    const client = boxSDK.getBasicClient(tokenInfo.accessToken);
    let userInfo: any;
    if (client.users && typeof client.users.getCurrentUser === 'function') {
      userInfo = await client.users.getCurrentUser();
    } else {
      throw new Error('Unable to get Box user info');
    }

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(tokenInfo.accessToken);
    const encryptedRefreshToken = tokenInfo.refreshToken ? encryptToken(tokenInfo.refreshToken) : undefined;

    // Create connection document
    const connectionData: any = {
      organizationId,
      type: connectionType,
      userId: userId || null,
      accountEmail: userInfo.login || userInfo.email || '',
      accountName: userInfo.name || '',
      accountId: userInfo.id,
      accessToken: encryptedAccessToken,
      scopes: boxConfig.scope ? [boxConfig.scope] : ['root_readwrite'],
      connectedBy: userId || 'system',
      isActive: true,
      connectedAt: Timestamp.now(),
    };

    // Only add refreshToken if it exists
    if (encryptedRefreshToken) {
      connectionData.refreshToken = encryptedRefreshToken;
    } else {
      // 🔧 FIX: Box should always provide refresh token - log warning if missing
      console.warn('⚠️ [BoxOAuth] No refresh token provided by Box - automatic token refresh will not work!');
      console.warn('⚠️ [BoxOAuth] Users will need to reconnect when access token expires');
      // Store access token expiry for debugging
      if (tokenInfo.expiresAt) {
        console.warn(`⚠️ [BoxOAuth] Access token will expire at: ${new Date(tokenInfo.expiresAt).toISOString()}`);
      }
    }

    // Add expiry if available
    if (tokenInfo.expiresAt) {
      connectionData.tokenExpiresAt = Timestamp.fromMillis(tokenInfo.expiresAt);
    }

    const connectionRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('boxConnections')
      .add(connectionData);

    const connectionId = connectionRef.id;

    // ALSO save to the unified cloudIntegrations location for compatibility with existing UI
    try {
      const unifiedIntegrationRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box');

      // Encrypt tokens using the shared binary-base64 format for unified access
      const unifiedTokens = {
        accessToken: tokenInfo.accessToken,
        refreshToken: tokenInfo.refreshToken,
        expiresAt: tokenInfo.expiresAt
      };
      const unifiedEncryptedTokens = encryptTokens(unifiedTokens);

      // Prepare unified document format
      const unifiedDoc = {
        userId: userId || 'system',
        organizationId: organizationId,
        provider: 'box',
        accountEmail: userInfo.login || userInfo.email || '',
        accountName: userInfo.name || 'Box User',
        accountId: userInfo.id,
        // We store both the connection ID and the unified encrypted tokens
        connectionId: connectionId,
        encryptedTokens: unifiedEncryptedTokens, // CRITICAL: Added this for refreshBoxAccessToken
        isActive: true,
        connectionMethod: 'oauth',
        connectedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        expiresAt: tokenInfo.expiresAt ? Timestamp.fromMillis(tokenInfo.expiresAt) : null
      };

      await unifiedIntegrationRef.set(unifiedDoc, { merge: true });
      console.log(`✅ [BoxOAuth] Saved to cloudIntegrations/box with encryptedTokens for organization ${organizationId}`);
    } catch (unifiedError) {
      console.warn('⚠️ [BoxOAuth] Failed to save to cloudIntegrations:', unifiedError);
    }

    // Create or update integration record
    try {
      const integrationRecordRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('box-integration');

      const existingRecord = await integrationRecordRef.get();
      const existingData = existingRecord.data();

      const integrationRecord = {
        id: 'box-integration',
        name: 'Box Integration',
        type: 'box',
        enabled: true,
        organizationId: organizationId,
        accountName: userInfo.name || '',
        accountEmail: userInfo.login || userInfo.email || '',
        credentials: {},
        settings: {},
        createdAt: existingData?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await integrationRecordRef.set(integrationRecord, { merge: true });
      console.log(`✅ [BoxOAuth] Created/updated integration record for Box`);
    } catch (recordError) {
      console.warn('⚠️ [BoxOAuth] Failed to create integration record:', recordError);
    }

    // Delete used state
    const stateDoc = await db.collection('boxOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateDoc.empty) {
      await stateDoc.docs[0].ref.delete();
    }

    console.log(`✅ [BoxOAuth] Connection established for ${connectionType} connection in org ${organizationId}`);
    console.log(`🔗 [BoxOAuth] redirectUrl from stateData: ${stateData.redirectUrl || 'not provided'}`);

    // Use redirect URL from state, or default to backbone-logic.web.app
    // The redirectUrl in state is the client app URL where the user should be redirected after OAuth
    // This is different from redirectUri which is used for token exchange
    // redirectUrl must be present in state (validated earlier)
    if (!stateData.redirectUrl) {
      throw new Error('redirectUrl missing from state data - this should have been validated earlier');
    }
    const finalRedirectUrl = stateData.redirectUrl;

    // Ensure the redirect URL has the success parameter
    let redirectUrlWithParam = finalRedirectUrl;
    if (!redirectUrlWithParam.includes('box_connected=')) {
      const separator = redirectUrlWithParam.includes('?') ? '&' : '?';
      redirectUrlWithParam = `${redirectUrlWithParam}${separator}box_connected=true`;
    } else {
      // Replace any existing box_error with box_connected
      redirectUrlWithParam = redirectUrlWithParam.replace(/box_error=[^&]*/g, 'box_connected=true');
    }

    console.log(`🔗 [BoxOAuth] Final redirect URL: ${redirectUrlWithParam}`);

    return {
      success: true,
      accountEmail: userInfo.login || userInfo.email || '',
      accountName: userInfo.name || '',
      redirectUrl: redirectUrlWithParam
    };

  } catch (error) {
    console.error('❌ [BoxOAuth] Error completing callback:', error);
    throw error;
  }
}


/**
 * Initiate Box OAuth flow (HTTP version)
 * Used by client-side redirect flow
 */
export const boxOAuthInitiateHttp = onRequest(
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
      const connectionType = 'organization'; // Default to organization-level connection for now

      console.log(`🚀 [BoxOAuth] Initiating OAuth flow (HTTP) for org: ${organizationId} by user: ${userId}`);

      // Validate organization access checks...
      // (For HTTP functions we've already verified the token belongs to the org in verifyAuthToken)

      // Get Box configuration from Firestore
      const config = await getBoxConfig(organizationId);

      // The redirectUri for OAuth provider (Box) should be the unified OAuth callback URL
      // Use unified callback to match the unified OAuth system
      const oauthCallbackUrl = callbackUrl || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback';

      // Use provided redirectUri as the client redirectUrl
      if (!redirectUri) {
        res.status(400).json(createErrorResponse('redirectUri is required'));
        return;
      }
      const clientRedirectUrl = redirectUri;

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour

      // Store state in Firestore
      await db.collection('boxOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: oauthCallbackUrl, // Firebase Function URL
        redirectUrl: clientRedirectUrl, // Client app URL
        expiry: stateExpiry,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Generate Box OAuth URL manually
      // CRITICAL: Box only supports ONE scope at a time. If config.scope contains multiple scopes,
      // use only root_readwrite (it includes read access)
      let scope = config.scope || 'root_readwrite';
      if (scope.includes(' ')) {
        // Multiple scopes detected - Box doesn't support this
        if (scope.includes('root_readwrite')) {
          scope = 'root_readwrite'; // Use the more permissive scope
        } else {
          scope = scope.split(' ')[0]; // Use first scope as fallback
        }
        console.log(`⚠️ [BoxOAuth] Multiple scopes detected, using single scope: ${scope}`);
      }

      const boxAuthBaseUrl = 'https://account.box.com/api/oauth2/authorize';
      const authUrlParams = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: oauthCallbackUrl,
        state: state,
        scope: scope, // Single scope only
      });
      const authUrl = `${boxAuthBaseUrl}?${authUrlParams.toString()}`;

      console.log(`✅ [BoxOAuth] Initiated OAuth flow (HTTP) successfully`);

      res.status(200).json(createSuccessResponse({
        authUrl,
        state,
      }));

    } catch (error: any) {
      console.error('❌ [BoxOAuth] Error initiating OAuth (HTTP):', error);
      const statusCode = error.code === 'permission-denied' ? 403 : 500;
      res.status(statusCode).json(createErrorResponse('Failed to initiate OAuth', error.message));
    }
  }
);
