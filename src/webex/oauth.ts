/**
 * Webex OAuth Functions
 * 
 * Handle OAuth flow for Webex connections
 * Supports organization-level connections
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as crypto from 'crypto';
import { getWebexConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';
import axios from 'axios';

/**
 * Encrypt sensitive token data
 */
function encryptToken(text: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive token data
 */
function decryptToken(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const algorithm = 'aes-256-gcm';
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Initiate Webex OAuth flow
 * 
 * Creates OAuth URL and state for organization connection
 */
export const webexOAuthInitiate = onCall(
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
          throw new HttpsError('permission-denied', 'Only organization admins can connect Webex');
        }
        const userRole = authToken.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'owner') {
          throw new HttpsError('permission-denied', 'Admin role required for organization Webex connection');
        }
      }

      // Get Webex configuration from Firestore
      const config = await getWebexConfig(organizationId);

      // Use provided redirectUri or default from config
      const finalRedirectUri = redirectUri || config.redirectUri;

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour

      // Store state in Firestore
      await db.collection('webexOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUri: finalRedirectUri,
        expiry: stateExpiry,
      });

      // Build Webex OAuth URL
      // Webex OAuth 2.0 endpoint
      const scopes = config.scopes.join(' ');
      const authUrl = `https://webexapis.com/v1/authorize?` +
        `client_id=${encodeURIComponent(config.clientId)}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(finalRedirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${encodeURIComponent(state)}`;

      console.log(`✅ [WebexOAuth] Initiated OAuth flow for ${connectionType} connection in org ${organizationId}`);

      return {
        url: authUrl,
        state,
      };

    } catch (error) {
      console.error('❌ [WebexOAuth] Error initiating OAuth:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to initiate OAuth');
    }
  }
);

/**
 * Refresh expired Webex access token
 */
export const webexOAuthRefresh = onCall(
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
        .collection('webexConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      if (!connectionData.refreshToken) {
        throw new HttpsError('failed-precondition', 'No refresh token available');
      }

      // Get Webex configuration
      const config = await getWebexConfig(organizationId);

      // Decrypt refresh token
      const refreshToken = decryptToken(connectionData.refreshToken);

      // Webex token refresh endpoint
      const tokenResponse = await axios.post('https://webexapis.com/v1/access_token', {
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Update connection with new tokens
      const encryptedAccessToken = encryptToken(access_token);
      const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : connectionData.refreshToken;

      const expiresAt = expires_in ? Timestamp.fromMillis(Date.now() + (expires_in * 1000)) : null;

      await connectionRef.update({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: expiresAt,
        lastSyncedAt: Timestamp.now(),
      });

      console.log(`✅ [WebexOAuth] Token refreshed for connection ${connectionId}`);

      return {
        success: true,
        message: 'Token refreshed successfully',
      };

    } catch (error: any) {
      console.error('❌ [WebexOAuth] Error refreshing token:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error.response?.status === 401) {
        throw new HttpsError('unauthenticated', 'Invalid refresh token. Please reconnect Webex.');
      }

      throw new HttpsError('internal', 'Failed to refresh token');
    }
  }
);

/**
 * Revoke Webex access
 */
export const webexOAuthRevoke = onCall(
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
        .collection('webexConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      // Try to revoke token with Webex API
      if (connectionData.accessToken) {
        try {
          const accessToken = decryptToken(connectionData.accessToken);
          await axios.post('https://webexapis.com/v1/access_token/revoke', {
            token: accessToken,
          });
        } catch (revokeError) {
          // Log but don't fail - token may already be revoked
          console.warn('⚠️ [WebexOAuth] Could not revoke token with Webex API:', revokeError);
        }
      }

      // Delete connection from Firestore
      await connectionRef.delete();

      console.log(`✅ [WebexOAuth] Access revoked for connection ${connectionId}`);

      return {
        success: true,
        message: 'Webex access revoked successfully',
      };

    } catch (error) {
      console.error('❌ [WebexOAuth] Error revoking access:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Failed to revoke access');
    }
  }
);

/**
 * HTTP endpoint for Webex OAuth callback
 * This is called by Webex after user authorizes the app
 */
export const webexOAuthCallback = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      // Handle OAuth error from Webex
      if (error) {
        console.error('❌ [WebexOAuth] OAuth error from Webex:', error);
        return res.redirect('https://backbone-logic.web.app/integration-settings?webex_error=authorization_failed');
      }

      if (!code || !state) {
        return res.redirect('https://backbone-logic.web.app/integration-settings?webex_error=missing_parameters');
      }

      // Verify state and complete OAuth flow
      const stateDoc = await db.collection('webexOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateDoc.empty) {
        return res.redirect('https://backbone-logic.web.app/integration-settings?webex_error=invalid_state');
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
      console.error('❌ [WebexOAuth] Error in callback handler:', error);
      return res.redirect('https://backbone-logic.web.app/integration-settings?webex_error=callback_failed');
    }
  }
);

async function completeOAuthCallback(code: string, state: string, stateData: any) {
  try {
    const { organizationId, connectionType, userId, redirectUri } = stateData;

    // Get Webex configuration
    const config = await getWebexConfig(organizationId);

    // Exchange code for token
    const tokenResponse = await axios.post('https://webexapis.com/v1/access_token', {
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: redirectUri || config.redirectUri,
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      throw new Error('Token exchange succeeded but no access_token received');
    }

    // Get user info from Webex
    const userInfoResponse = await axios.get('https://webexapis.com/v1/people/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    const userInfo = userInfoResponse.data;

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : undefined;

    // Create connection document
    const connectionData: any = {
      organizationId,
      type: connectionType,
      userId: userId || null,
      accountEmail: userInfo.emails?.[0] || null,
      accountName: userInfo.displayName || userInfo.nickName || null,
      accountId: userInfo.id,
      accessToken: encryptedAccessToken,
      scopes: config.scopes,
      connectedBy: userId || 'system',
      isActive: true,
      connectedAt: Timestamp.now(),
    };

    // Only add refreshToken if it exists
    if (encryptedRefreshToken) {
      connectionData.refreshToken = encryptedRefreshToken;
    }

    // Add expiry if available
    if (expires_in) {
      connectionData.tokenExpiresAt = Timestamp.fromMillis(Date.now() + (expires_in * 1000));
    }

    const connectionRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('webexConnections')
      .add(connectionData);

    // Clean up state document
    const stateQuery = await db.collection('webexOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateQuery.empty) {
      await stateQuery.docs[0].ref.delete();
    }

    console.log(`✅ [WebexOAuth] OAuth completed for org ${organizationId}, connection ${connectionRef.id}`);

    // Build redirect URL with success
    const redirectBase = redirectUri || config.redirectUri || 'https://backbone-logic.web.app/integration-settings';
    const separator = redirectBase.includes('?') ? '&' : '?';
    return `${redirectBase}${separator}webex_success=true&connection_id=${connectionRef.id}`;

  } catch (error: any) {
    console.error('❌ [WebexOAuth] Error completing OAuth callback:', error);

    const redirectBase = stateData?.redirectUri || 'https://backbone-logic.web.app/integration-settings';
    const separator = redirectBase.includes('?') ? '&' : '?';
    const errorMessage = error.response?.data?.error_description || error.message || 'Unknown error';
    return `${redirectBase}${separator}webex_error=${encodeURIComponent(errorMessage)}`;
  }
}

