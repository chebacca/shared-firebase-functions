/**
 * Apple Connect OAuth Functions
 * 
 * Handle OAuth flow for Apple Connect (Enterprise Directory) connections
 * Supports organization-level connections
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, validateOrganizationAccess } from '../shared/utils';
import * as crypto from 'crypto';
import { getAppleConnectConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';
import jwt from 'jsonwebtoken';

/**
 * Encrypt sensitive token data
 */
function encryptToken(text: string): string {
  const algorithm = 'aes-256-gcm';
  let encryptionKeyValue: string;
  try {
    encryptionKeyValue = getEncryptionKey();
  } catch (keyError) {
    console.error('❌ [AppleConnectOAuth] Failed to get encryption key:', keyError);
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
  }

  if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
    throw new Error('Encryption key is invalid. ENCRYPTION_KEY must be at least 32 characters.');
  }

  const key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
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
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid token format. Expected 3 parts separated by ':', got ${parts.length} parts.`);
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const algorithm = 'aes-256-gcm';
  const encryptionKeyValue = getEncryptionKey();
  const key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate secure state parameter for OAuth flow
 */
function generateSecureState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate client secret JWT for Apple OAuth
 */
function generateClientSecret(config: { teamId: string; keyId: string; privateKey: string; clientId: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.teamId,
    iat: now,
    exp: now + 3600, // 1 hour
    aud: 'https://appleid.apple.com',
    sub: config.clientId,
  };

  return jwt.sign(payload, config.privateKey, {
    algorithm: 'ES256',
    keyid: config.keyId,
  });
}

/**
 * Initiate Apple Connect OAuth flow
 */
export const appleConnectOAuthInitiate = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId, redirectUri } = data;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      // Check if user has admin role (required for connecting integrations)
      const authToken = auth.token;
      const userRole = authToken?.role?.toLowerCase() || authToken?.licensingRole?.toLowerCase();
      if (userRole !== 'admin' && userRole !== 'owner') {
        throw new HttpsError('permission-denied', 'Admin role required to connect Apple Connect');
      }

      // Get Apple Connect configuration
      const config = await getAppleConnectConfig(organizationId);

      // Generate secure state parameter
      const state = generateSecureState();

      // For Apple OAuth, we need to use the HTTP callback endpoint
      // Get the project ID to construct the callback URL
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'backbone-logic';
      const callbackUrl = `https://us-central1-${projectId}.cloudfunctions.net/appleConnectOAuthCallbackHttp`;

      // Store state in Firestore for verification
      await db.collection('appleConnectOAuthStates').add({
        state,
        organizationId,
        redirectUri: redirectUri || config.redirectUri,
        clientRedirectUri: redirectUri || config.redirectUri, // Store client redirect for after callback
        callbackUrl, // Store callback URL
        userId: auth.uid,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), // 10 minutes
      });

      // Generate client secret JWT
      const clientSecret = generateClientSecret({
        teamId: config.teamId,
        keyId: config.keyId,
        privateKey: config.privateKey,
        clientId: config.clientId,
      });

      // Generate authorization URL
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl, // Use HTTP callback endpoint
        response_type: 'code',
        scope: 'name email',
        state: state,
        response_mode: 'form_post',
      });

      const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;

      console.log(`✅ [AppleConnectOAuth] Initiated OAuth flow for org: ${organizationId}`);

      // Return in format expected by OAuthFlowManager
      return {
        authUrl: authUrl,
        url: authUrl, // Also include 'url' for compatibility
        state,
      };

    } catch (error) {
      console.error('❌ [AppleConnectOAuth] Error initiating OAuth:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to initiate OAuth');
    }
  }
);

/**
 * Handle Apple Connect OAuth callback
 * Exchange authorization code for tokens
 */
export const appleConnectOAuthCallback = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { code, state, organizationId } = data;

      if (!code || !state || !organizationId) {
        throw new HttpsError('invalid-argument', 'Code, state, and organizationId are required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      // Verify state
      const stateQuery = await db
        .collection('appleConnectOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateQuery.empty) {
        throw new HttpsError('invalid-argument', 'Invalid or expired state parameter');
      }

      const stateData = stateQuery.docs[0].data();
      if (stateData.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'State does not match organization');
      }

      // Delete used state
      await stateQuery.docs[0].ref.delete();

      // Get Apple Connect configuration
      const config = await getAppleConnectConfig(organizationId);

      // Generate client secret JWT
      const clientSecret = generateClientSecret({
        teamId: config.teamId,
        keyId: config.keyId,
        privateKey: config.privateKey,
        clientId: config.clientId,
      });

      // Exchange code for tokens
      const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: stateData.redirectUri || config.redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        expires_in?: number;
        token_type?: string;
      };

      if (!tokenData.access_token) {
        throw new Error('Token exchange succeeded but no access_token received');
      }

      // Decode ID token to get user info
      const idToken = tokenData.id_token;
      let userInfo: { email?: string; name?: string; sub: string } = { sub: '' };
      
      if (idToken) {
        const decoded = jwt.decode(idToken) as any;
        userInfo = {
          email: decoded?.email,
          name: decoded?.name || decoded?.email?.split('@')[0] || 'Apple User',
          sub: decoded?.sub || '',
        };
      }

      // Encrypt tokens
      const encryptedAccessToken = encryptToken(tokenData.access_token);
      const encryptedRefreshToken = tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined;

      // Calculate expiry
      const expiresAt = tokenData.expires_in 
        ? Date.now() + (tokenData.expires_in * 1000)
        : Date.now() + (3600 * 1000); // Default 1 hour

      // Save connection to Firestore
      const connectionData: any = {
        organizationId,
        accountEmail: userInfo.email || '',
        accountName: userInfo.name || 'Apple Connect User',
        accountId: userInfo.sub,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: Timestamp.fromMillis(expiresAt),
        connectedAt: Timestamp.now(),
        isActive: true,
        provider: 'apple_connect',
        scopes: ['name', 'email'],
      };

      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('apple_connect')
        .set(connectionData, { merge: true });

      console.log(`✅ [AppleConnectOAuth] OAuth callback completed for org: ${organizationId}`);

      return {
        success: true,
        accountEmail: userInfo.email,
        accountName: userInfo.name,
      };

    } catch (error) {
      console.error('❌ [AppleConnectOAuth] Error in OAuth callback:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to complete OAuth callback');
    }
  }
);

/**
 * HTTP endpoint for Apple Connect OAuth callback
 * Apple uses form_post response mode, so this handles POST requests
 */
export const appleConnectOAuthCallbackHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      // Apple uses form_post, so data comes in req.body, not req.query
      // Handle both POST (form_post) and GET (fallback) requests
      const bodyData = req.method === 'POST' ? req.body : {};
      const queryData = req.query || {};
      const { code, state, error, user } = { ...queryData, ...bodyData };

      // Handle OAuth error from Apple
      if (error) {
        console.error('❌ [AppleConnectOAuth] OAuth error from Apple:', error);
        return res.redirect('https://backbone-logic.web.app/dashboard/integrations?apple_connect_error=authorization_failed');
      }

      if (!code || !state) {
        return res.redirect('https://backbone-logic.web.app/dashboard/integrations?apple_connect_error=missing_parameters');
      }

      // Verify state
      const stateQuery = await db
        .collection('appleConnectOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateQuery.empty) {
        return res.redirect('https://backbone-logic.web.app/dashboard/integrations?apple_connect_error=invalid_state');
      }

      const stateData = stateQuery.docs[0].data();
      const { organizationId, redirectUri, clientRedirectUri } = stateData;

      // Delete used state
      await stateQuery.docs[0].ref.delete();

      // Get Apple Connect configuration
      const config = await getAppleConnectConfig(organizationId);

      // Generate client secret JWT
      const clientSecret = generateClientSecret({
        teamId: config.teamId,
        keyId: config.keyId,
        privateKey: config.privateKey,
        clientId: config.clientId,
      });

      // Exchange code for tokens
      const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: stateData.callbackUrl || redirectUri || config.redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ [AppleConnectOAuth] Token exchange failed:', errorText);
        return res.redirect('https://backbone-logic.web.app/dashboard/integrations?apple_connect_error=token_exchange_failed');
      }

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        expires_in?: number;
        token_type?: string;
      };

      if (!tokenData.access_token) {
        return res.redirect('https://backbone-logic.web.app/dashboard/integrations?apple_connect_error=no_access_token');
      }

      // Decode ID token to get user info
      const idToken = tokenData.id_token;
      let userInfo: { email?: string; name?: string; sub: string } = { sub: '' };
      
      if (idToken) {
        const decoded = jwt.decode(idToken) as any;
        // Apple may send user info in the initial request body (form_post)
        let userName = decoded?.name;
        if (!userName && user && typeof user === 'string') {
          try {
            const userObj = JSON.parse(user);
            userName = userObj.name;
          } catch {
            // Ignore parse errors
          }
        }
        userInfo = {
          email: decoded?.email,
          name: userName || decoded?.email?.split('@')[0] || 'Apple User',
          sub: decoded?.sub || '',
        };
      }

      // Encrypt tokens
      const encryptedAccessToken = encryptToken(tokenData.access_token);
      const encryptedRefreshToken = tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined;

      // Calculate expiry
      const expiresAt = tokenData.expires_in 
        ? Date.now() + (tokenData.expires_in * 1000)
        : Date.now() + (3600 * 1000);

      // Save connection to Firestore
      const connectionData: any = {
        organizationId,
        accountEmail: userInfo.email || '',
        accountName: userInfo.name || 'Apple Connect User',
        accountId: userInfo.sub,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: Timestamp.fromMillis(expiresAt),
        connectedAt: Timestamp.now(),
        isActive: true,
        provider: 'apple_connect',
        scopes: ['name', 'email'],
      };

      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('apple_connect')
        .set(connectionData, { merge: true });

      console.log(`✅ [AppleConnectOAuth] OAuth callback completed for org: ${organizationId}`);

      // Redirect back to client application
      const finalRedirectUri = clientRedirectUri || redirectUri || 'https://backbone-logic.web.app/dashboard/integrations';
      return res.redirect(`${finalRedirectUri}?apple_connect=connected`);

    } catch (error) {
      console.error('❌ [AppleConnectOAuth] Error in HTTP callback handler:', error);
      return res.redirect('https://backbone-logic.web.app/dashboard/integrations?apple_connect_error=callback_failed');
    }
  }
);

/**
 * Revoke Apple Connect access
 */
export const appleConnectRevokeAccess = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId } = data;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      // Check if user has admin role (required for disconnecting integrations)
      const authToken = auth.token;
      const userRole = authToken?.role?.toLowerCase() || authToken?.licensingRole?.toLowerCase();
      if (userRole !== 'admin' && userRole !== 'owner') {
        throw new HttpsError('permission-denied', 'Admin role required to disconnect Apple Connect');
      }

      // Get connection to revoke
      const connectionRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('apple_connect');

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Apple Connect connection not found');
      }

      const connectionData = connectionDoc.data()!;

      // Try to revoke token with Apple (optional - may fail if token already expired)
      try {
        const config = await getAppleConnectConfig(organizationId);
        const clientSecret = generateClientSecret({
          teamId: config.teamId,
          keyId: config.keyId,
          privateKey: config.privateKey,
          clientId: config.clientId,
        });

        const accessToken = decryptToken(connectionData.accessToken);

        await fetch('https://appleid.apple.com/auth/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: clientSecret,
            token: accessToken,
            token_type_hint: 'access_token',
          }),
        });
      } catch (revokeError) {
        // Log but don't fail - token may already be expired
        console.warn('⚠️ [AppleConnectOAuth] Failed to revoke token with Apple (may already be expired):', revokeError);
      }

      // Delete connection from Firestore
      await connectionRef.delete();

      console.log(`✅ [AppleConnectOAuth] Access revoked for org: ${organizationId}`);

      return {
        success: true,
        message: 'Apple Connect access revoked successfully',
      };

    } catch (error) {
      console.error('❌ [AppleConnectOAuth] Error revoking access:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to revoke access');
    }
  }
);

