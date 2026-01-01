/**
 * Slack OAuth Functions
 * 
 * ⚠️ DEPRECATED - DO NOT USE ⚠️
 * 
 * These functions are deprecated and replaced by the unified OAuth system.
 * Use the following functions instead:
 * - initiateOAuth (from integrations/unified-oauth/functions.ts)
 * - handleOAuthCallback (from integrations/unified-oauth/functions.ts)
 * - refreshOAuthToken (from integrations/unified-oauth/functions.ts)
 * - revokeOAuthConnection (from integrations/unified-oauth/functions.ts)
 * 
 * This file is kept for reference only and is NOT exported.
 * All OAuth functions are now handled by the unified OAuth system.
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as crypto from 'crypto';
import { getSlackConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';

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
    console.error('❌ [SlackOAuth] Failed to get encryption key:', keyError);
    throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
  }

  if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
    console.error('❌ [SlackOAuth] Encryption key is invalid:', {
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
    console.error('❌ [SlackOAuth] Failed to derive key:', hashError);
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
      console.error('❌ [SlackOAuth] Invalid key length error during encryption:', {
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
      console.error('❌ [SlackOAuth] Failed to get encryption key:', keyError);
      throw new Error('Encryption key not available. Ensure ENCRYPTION_KEY secret is properly configured.');
    }

    if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
      console.error('❌ [SlackOAuth] Encryption key is invalid:', {
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
      console.error('❌ [SlackOAuth] Failed to derive key:', hashError);
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
        console.error('❌ [SlackOAuth] Authentication tag verification failed:', {
          errorMessage,
          errorCode: decryptError.code,
        });
        throw new Error('Token authentication failed. The Slack connection token may be corrupted or encrypted with a different key. Please re-connect your Slack workspace.');
      }
      
      if (decryptError.message && decryptError.message.includes('Invalid key length')) {
        console.error('❌ [SlackOAuth] Invalid key length error during decryption:', {
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
    console.error('❌ [SlackOAuth] Failed to decrypt token:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw error instanceof Error ? error : new Error('Failed to decrypt access token. Configuration error.');
  }
}

/**
 * Initiate Slack OAuth flow
 * 
 * Creates OAuth URL and state for user or organization connection
 */
export const slackOAuthInitiate = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      console.log(`🔍 [SlackOAuth] Initiate request received, data keys:`, Object.keys(request.data || {}));
      const { organizationId, connectionType, userId, redirectUrl } = request.data as {
        organizationId: string;
        connectionType: 'user' | 'organization';
        userId?: string;
        redirectUrl?: string;
      };
      console.log(`🔍 [SlackOAuth] Parsed redirectUrl: ${redirectUrl || 'NOT PROVIDED'}`);

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
          throw new HttpsError('permission-denied', 'Only organization admins can connect Slack workspaces');
        }
        // Check for both 'admin' and 'ADMIN' role (case insensitive)
        const userRole = authToken.role?.toLowerCase();
        if (userRole !== 'admin') {
          throw new HttpsError('permission-denied', 'Admin role required for organization Slack connection');
        }
      }

      // Get Slack configuration from Firestore
      const config = await getSlackConfig(organizationId);

      // Generate state parameter for OAuth
      const state = crypto.randomBytes(32).toString('hex');
      const stateExpiry = (Date.now() + (3600 * 1000)).toString(); // 1 hour as string

      // Store state in Firestore
      // Use provided redirectUrl or default to backbone-client.web.app
      // The client should always provide redirectUrl based on window.location.origin
      const finalRedirectUrl = redirectUrl || 'https://backbone-client.web.app/messages?slack_connected=true&tab=slack';
      console.log(`🔗 [SlackOAuth] Storing redirectUrl in state: ${finalRedirectUrl} (provided: ${redirectUrl || 'none'})`);
      const stateDoc = await db.collection('slackOAuthStates').add({
        state,
        organizationId,
        connectionType,
        userId: userId || null,
        redirectUrl: finalRedirectUrl,
        expiry: stateExpiry,
      });

      // Generate OAuth URL
      const scopes = config.scopes.join(',');
      const authUrl = `https://slack.com/oauth/v2/authorize?` +
        `client_id=${config.clientId}&` +
        `scope=${scopes}&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `state=${state}`;

      console.log(`✅ [SlackOAuth] Initiated OAuth flow for ${connectionType} connection in org ${organizationId}`);

      return {
        url: authUrl,
        state,
      };

    } catch (error) {
      console.error('❌ [SlackOAuth] Error initiating OAuth:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to initiate OAuth');
    }
  }
);

/**
 * Refresh expired Slack access token
 */
export const slackOAuthRefresh = onCall(
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
        .collection('slackConnections')
        .doc(connectionId);

      const connectionDoc = await connectionRef.get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      if (!connectionData.refreshToken) {
        throw new HttpsError('failed-precondition', 'No refresh token available');
      }

      // Get Slack configuration
      const config = await getSlackConfig(organizationId);

      // Decrypt refresh token
      const refreshToken = decryptToken(connectionData.refreshToken);

      // Refresh token
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
        }),
      });

      const tokenData = await tokenResponse.json() as any;

      if (!tokenData.ok) {
        throw new HttpsError('internal', `Token refresh failed: ${tokenData.error}`);
      }

      // Update connection with new tokens
      const encryptedAccessToken = encryptToken(tokenData.access_token);
      
      await connectionRef.update({
        accessToken: encryptedAccessToken,
        lastSyncedAt: new Date(),
      });

      console.log(`✅ [SlackOAuth] Token refreshed for connection ${connectionId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackOAuth] Error refreshing token:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to refresh token');
    }
  }
);

/**
 * Revoke Slack workspace connection
 */
export const slackRevokeAccess = onCall(
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
        .collection('slackConnections')
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
          console.warn('⚠️ [SlackOAuth] Cannot decrypt token for revocation - token is corrupted. Marking connection as inactive anyway.');
          tokenDecryptionFailed = true;
        } else {
          // Re-throw if it's a different type of error (key misconfiguration, etc.)
          throw decryptError;
        }
      }

      // Revoke token with Slack (only if we successfully decrypted it)
      if (accessToken && !tokenDecryptionFailed) {
        try {
          const revokeResponse = await fetch('https://slack.com/api/auth.revoke', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });
          
          const revokeData = await revokeResponse.json() as { ok?: boolean; error?: string };
          if (!revokeData.ok) {
            console.warn('⚠️ [SlackOAuth] Slack API returned error during revocation:', revokeData.error);
          }
        } catch (error) {
          console.warn('⚠️ [SlackOAuth] Failed to revoke token with Slack API:', error);
          // Continue anyway - we'll still mark as inactive
        }
      }

      // Mark connection as inactive (whether or not we could revoke with Slack)
      await connectionRef.update({
        isActive: false,
        disconnectedAt: Timestamp.now(),
      });

      console.log(`✅ [SlackOAuth] Connection marked as inactive for ${connectionId}${tokenDecryptionFailed ? ' (token was corrupted, could not revoke with Slack)' : ''}`);

      return {
        success: true,
        tokenWasCorrupted: tokenDecryptionFailed,
        message: tokenDecryptionFailed 
          ? 'Connection disconnected. The token was corrupted and could not be revoked with Slack, but the connection has been marked as inactive.'
          : 'Connection successfully revoked and disconnected.',
      };

    } catch (error) {
      console.error('❌ [SlackOAuth] Error revoking access:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to revoke access');
    }
  }
);

/**
 * HTTP endpoint for Slack OAuth callback
 * This is called by Slack after user authorizes the app
 */
export const slackOAuthCallback = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      const { code, state, error } = req.query;

      // Get redirect URL from state for error redirects
      let errorRedirectUrl = 'https://backbone-client.web.app/messages?slack_error=authorization_failed&tab=slack';
      
      // Handle OAuth error from Slack
      if (error) {
        console.error('❌ [SlackOAuth] OAuth error from Slack:', error);
        // Try to get redirect URL from state if available
        if (state) {
          try {
            const stateDoc = await db.collection('slackOAuthStates')
              .where('state', '==', state)
              .limit(1)
              .get();
            if (!stateDoc.empty) {
              const stateData = stateDoc.docs[0].data();
              if (stateData.redirectUrl) {
                // Replace success param with error param, preserving the origin
                errorRedirectUrl = stateData.redirectUrl
                  .replace('slack_connected=true', 'slack_error=authorization_failed')
                  .replace('slack_connected=true&', 'slack_error=authorization_failed&');
              }
            }
          } catch (e) {
            console.warn('⚠️ [SlackOAuth] Could not get redirect URL from state:', e);
            // Use default if state lookup fails
          }
        }
        return res.redirect(errorRedirectUrl);
      }

      if (!code || !state) {
        // Try to get redirect URL from state for missing parameters error
        let missingParamsRedirect = 'https://backbone-client.web.app/messages?slack_error=missing_parameters&tab=slack';
        if (state) {
          try {
            const stateDoc = await db.collection('slackOAuthStates')
              .where('state', '==', state)
              .limit(1)
              .get();
            if (!stateDoc.empty) {
              const stateData = stateDoc.docs[0].data();
              if (stateData.redirectUrl) {
                missingParamsRedirect = stateData.redirectUrl
                  .replace('slack_connected=true', 'slack_error=missing_parameters')
                  .replace('slack_connected=true&', 'slack_error=missing_parameters&');
              }
            }
          } catch (e) {
            // Use default if state lookup fails
          }
        }
        return res.redirect(missingParamsRedirect);
      }

      // Verify state and complete OAuth flow
      const stateDoc = await db.collection('slackOAuthStates')
        .where('state', '==', state)
        .limit(1)
        .get();

      if (stateDoc.empty) {
        // Use default redirect for invalid state (state lookup failed, so we can't get the original redirectUrl)
        return res.redirect('https://backbone-client.web.app/messages?slack_error=invalid_state&tab=slack');
      }

      const stateData = stateDoc.docs[0].data();
      console.log(`🔗 [SlackOAuth] Retrieved state data, redirectUrl: ${stateData.redirectUrl || 'not found'}`);
      
      // If redirectUrl is missing from old state document, try to infer from referer or use default
      if (!stateData.redirectUrl) {
        const referer = req.headers.referer || req.headers.origin || '';
        console.log(`⚠️ [SlackOAuth] redirectUrl missing from state, referer: ${referer}`);
        
        // Try to extract origin from referer
        if (referer) {
          try {
            const refererUrl = new URL(referer);
            stateData.redirectUrl = `${refererUrl.origin}/messages?slack_connected=true&tab=slack`;
            console.log(`🔗 [SlackOAuth] Inferred redirectUrl from referer: ${stateData.redirectUrl}`);
          } catch (e) {
            console.warn('⚠️ [SlackOAuth] Could not parse referer URL:', e);
          }
        }
        
        // Final fallback - use backbone-client as default since both apps can use any org
        // The client should always provide redirectUrl, so this should rarely be needed
        if (!stateData.redirectUrl) {
          // Default to backbone-client.web.app (production workflow system)
          // This is safer than trying to guess based on org ID
          stateData.redirectUrl = 'https://backbone-client.web.app/messages?slack_connected=true&tab=slack';
          console.log(`⚠️ [SlackOAuth] Using default fallback redirectUrl: ${stateData.redirectUrl}`);
          console.log(`⚠️ [SlackOAuth] This should not happen - redirectUrl should be provided by client`);
        }
      }
      
      // Exchange code for token (call internal function logic)
      const redirectUrl = await completeOAuthCallback(
        code as string,
        state as string,
        stateData
      );

      console.log(`🔗 [SlackOAuth] Redirecting to: ${redirectUrl}`);
      return res.redirect(redirectUrl);

    } catch (error) {
      console.error('❌ [SlackOAuth] Error in callback handler:', error);
      // Try to get redirect URL from state for callback failed error
      let callbackFailedRedirect = 'https://backbone-client.web.app/messages?slack_error=callback_failed&tab=slack';
      if (req.query.state) {
        try {
          const stateDoc = await db.collection('slackOAuthStates')
            .where('state', '==', req.query.state)
            .limit(1)
            .get();
          if (!stateDoc.empty) {
            const stateData = stateDoc.docs[0].data();
            if (stateData.redirectUrl) {
              callbackFailedRedirect = stateData.redirectUrl
                .replace('slack_connected=true', 'slack_error=callback_failed')
                .replace('slack_connected=true&', 'slack_error=callback_failed&');
            }
          }
        } catch (e) {
          // Use default if state lookup fails
        }
      }
      return res.redirect(callbackFailedRedirect);
    }
  }
);

async function completeOAuthCallback(code: string, state: string, stateData: any) {
  try {
    const { organizationId, connectionType, userId, redirectUrl } = stateData;

    // Get Slack configuration
    const slackConfig = await getSlackConfig(organizationId);

    // Exchange code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: slackConfig.clientId,
        client_secret: slackConfig.clientSecret,
        code,
        redirect_uri: slackConfig.redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (!tokenData.ok) {
      throw new Error(`Slack OAuth error: ${tokenData.error}`);
    }

    // Extract workspace and token info
    const { access_token, refresh_token, authed_user, team } = tokenData;

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : undefined;

    // Create connection document (only include refreshToken if it exists)
    const connectionData: any = {
      organizationId,
      type: connectionType,
      userId: userId || null,
      workspaceId: team.id,
      workspaceName: team.name,
      teamId: team.id,
      accessToken: encryptedAccessToken,
      scopes: slackConfig.scopes,
      connectedBy: userId || 'system',
      isActive: true,
    };

    // Only add refreshToken if it exists (Firestore doesn't accept undefined)
    if (encryptedRefreshToken) {
      connectionData.refreshToken = encryptedRefreshToken;
    }

    const connectionRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('slackConnections')
      .add(connectionData);

    const connectionId = connectionRef.id;

    // Create or update integration record
    try {
      const integrationRecordRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('slack-integration');

      // Check if record exists to preserve createdAt
      const existingRecord = await integrationRecordRef.get();
      const existingData = existingRecord.data();

      const integrationRecord = {
        id: 'slack-integration',
        name: 'Slack Integration',
        type: 'slack',
        enabled: true,
        organizationId: organizationId,
        accountName: team.name,
        credentials: {},
        settings: {},
        testStatus: 'success',
        testMessage: `Connected to ${team.name} workspace`,
        createdAt: existingData?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await integrationRecordRef.set(integrationRecord, { merge: true });
      console.log(`✅ [SlackOAuth] Created/updated integration record for Slack`);
    } catch (recordError) {
      // Don't fail the whole OAuth flow if integration record creation fails
      console.warn('⚠️ [SlackOAuth] Failed to create integration record:', recordError);
    }

    // Fetch and sync channels after creating connection
    try {
      const { WebClient } = await import('@slack/web-api');
      const slackClient = new WebClient(access_token);
      
      // Get channels from Slack
      const channelsResult = await slackClient.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 1000,
      });

      if (channelsResult.ok && channelsResult.channels) {
        // Store channels in Firestore
        const batch = db.batch();
        
        for (const channel of channelsResult.channels) {
          const channelRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('slackChannels')
            .doc(channel.id || '');

          batch.set(channelRef, {
            connectionId,
            channelId: channel.id,
            channelName: channel.name || '',
            isPrivate: channel.is_private || false,
            isArchived: channel.is_archived || false,
            memberCount: channel.num_members || 0,
            purpose: channel.purpose?.value,
            topic: channel.topic?.value,
            lastSyncedAt: Timestamp.now(),
            isMuted: false,
            notificationsEnabled: true,
          }, { merge: true });
        }

        await batch.commit();
        console.log(`✅ [SlackOAuth] Synced ${channelsResult.channels.length} channels for connection ${connectionId}`);
      }
    } catch (syncError) {
      // Don't fail the whole OAuth flow if channel sync fails
      console.warn('⚠️ [SlackOAuth] Failed to sync channels:', syncError);
    }

    // Delete used state
    const stateDoc = await db.collection('slackOAuthStates')
      .where('state', '==', state)
      .limit(1)
      .get();

    if (!stateDoc.empty) {
      await stateDoc.docs[0].ref.delete();
    }

    console.log(`✅ [SlackOAuth] Connection established for ${connectionType} connection in org ${organizationId}`);
    console.log(`🔗 [SlackOAuth] redirectUrl from stateData: ${redirectUrl || 'not provided'}`);

    // Use redirect URL from state, or default to backbone-client.web.app
    const finalRedirectUrl = redirectUrl || 'https://backbone-client.web.app/messages?slack_connected=true&tab=slack';
    console.log(`🔗 [SlackOAuth] Final redirect URL: ${finalRedirectUrl}`);
    return finalRedirectUrl;

  } catch (error) {
    console.error('❌ [SlackOAuth] Error completing callback:', error);
    throw error;
  }
}

