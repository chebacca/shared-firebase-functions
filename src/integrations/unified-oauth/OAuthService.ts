/**
 * Unified OAuth Service
 * 
 * Handles OAuth flows for ANY registered provider
 * Single service for all OAuth operations
 */

import { providerRegistry } from './ProviderRegistry';
import { OAuthProvider, TokenSet } from './types';
import { db } from '../../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptToken, decryptToken, generateSecureState } from './encryption';
import { encryptionKey } from './encryption';
import { encryptTokens } from '../encryption';

/**
 * Unified OAuth Service
 * Handles OAuth flows for ANY registered provider
 */
export class UnifiedOAuthService {
  /**
   * Initiate OAuth flow for any provider
   */
  async initiateOAuth(
    providerName: string,
    organizationId: string,
    userId: string,
    returnUrl?: string
  ): Promise<{ authUrl: string; state: string }> {
    const provider = providerRegistry.getProvider(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    if (provider.type !== 'oauth2') {
      throw new Error(`Provider ${providerName} does not support OAuth 2.0`);
    }

    // Generate state
    const state = generateSecureState();

    // Determine redirect URL from returnUrl or default to production
    // Default to /dashboard/integrations (correct route path)
    let redirectUrl = 'https://backbone-logic.web.app/dashboard/integrations';
    if (returnUrl) {
      // If returnUrl is provided, use it (could be localhost in dev, or Hub URL)
      // This will be the full URL like http://localhost:4001/dashboard/integrations
      // OR http://localhost:5300/apps/integrations (Hub URL)
      redirectUrl = returnUrl;
      console.log(`🔍 [OAuthService] Using provided returnUrl:`, {
        returnUrl,
        isHubUrl: returnUrl.includes('localhost:5300') || returnUrl.includes('hub'),
        isLicensingWebsite: returnUrl.includes('localhost:4001') || returnUrl.includes('backbone-logic.web.app')
      });
    } else {
      console.log(`ℹ️ [OAuthService] No returnUrl provided, using default: ${redirectUrl}`);
    }

    // Store state in Firestore with redirect URL
    await db.collection('oauthStates').doc(state).set({
      state,
      provider: providerName,
      organizationId,
      userId,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 3600000), // 1 hour
      redirectUrl: redirectUrl // Store the redirect URL for callback
    });

    console.log(`✅ [OAuthService] Stored OAuth state`, {
      provider: providerName,
      redirectUrl: redirectUrl,
      state: state.substring(0, 8) + '...',
      expiresIn: '1 hour',
      isHubUrl: redirectUrl.includes('localhost:5300') || redirectUrl.includes('hub')
    });

    // Determine the redirect URI for the provider
    // ALWAYS use Firebase Functions callback URL - it will redirect back to the client URL after processing
    // This ensures the redirect URI is always authorized in Google Cloud Console
    // EXCEPTION: Dropbox needs its own callback for legacy/consistency reasons
    const oauthCallbackUrl = providerName === 'dropbox'
      ? 'https://us-central1-backbone-logic.cloudfunctions.net/dropboxOAuthCallbackHttp'
      : 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback';

    const redirectUriToUse = oauthCallbackUrl;

    const authUrl = await (provider as OAuthProvider).getAuthUrl({
      organizationId,
      userId,
      redirectUri: redirectUriToUse,
      state
    });

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback for any provider
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; redirectUrl: string }> {
    console.log(`🔄 [OAuthService] Handling OAuth callback`, {
      state: state.substring(0, 8) + '...',
      hasCode: !!code
    });

    // Verify state - use get() with retry logic for eventual consistency
    // Retry up to 3 times with increasing delays to handle Firestore eventual consistency
    let stateDoc = await db.collection('oauthStates').doc(state).get();
    let retryCount = 0;
    const maxRetries = 3;

    while (!stateDoc.exists && retryCount < maxRetries) {
      const delay = (retryCount + 1) * 500; // 500ms, 1000ms, 1500ms
      console.warn(`⚠️ [OAuthService] State not found immediately, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      stateDoc = await db.collection('oauthStates').doc(state).get();
      retryCount++;
    }

    if (!stateDoc.exists) {
      // State doesn't exist - might be expired, invalid, or deleted
      console.error(`❌ [OAuthService] State document not found after ${maxRetries} retries: ${state.substring(0, 8)}...`);

      // Check if state might have been deleted due to expiration
      // Try to get any recent states for this organization to help debug
      try {
        const recentStates = await db.collection('oauthStates')
          .where('state', '==', state)
          .limit(1)
          .get();

        if (!recentStates.empty) {
          const recentState = recentStates.docs[0].data();
          const expiresAt = recentState.expiresAt?.toMillis();
          const now = Date.now();
          if (expiresAt && now > expiresAt) {
            console.warn(`⚠️ [OAuthService] State was found but expired`, {
              expiresAt: new Date(expiresAt).toISOString(),
              now: new Date(now).toISOString(),
              ageMinutes: (now - expiresAt) / 60000
            });
            throw new Error('OAuth state expired - state was created more than 1 hour ago');
          }
        }
      } catch (queryError) {
        console.warn(`⚠️ [OAuthService] Could not query for expired state:`, queryError);
      }

      throw new Error('Invalid or expired state - state document not found');
    }

    const stateData = stateDoc.data()!;

    console.log(`✅ [OAuthService] State found`, {
      provider: stateData.provider,
      organizationId: stateData.organizationId,
      createdAt: stateData.createdAt?.toDate?.()?.toISOString(),
      expiresAt: stateData.expiresAt?.toMillis ? new Date(stateData.expiresAt.toMillis()).toISOString() : 'unknown'
    });

    // Check expiry (states expire after 1 hour)
    const expiresAt = stateData.expiresAt?.toMillis();
    const now = Date.now();
    if (expiresAt && now > expiresAt) {
      console.warn(`⚠️ [OAuthService] State expired`, {
        expiresAt: new Date(expiresAt).toISOString(),
        now: new Date(now).toISOString(),
        ageMinutes: (now - expiresAt) / 60000
      });
      await stateDoc.ref.delete();
      throw new Error('OAuth state expired - state was created more than 1 hour ago');
    }

    const { provider: providerName, organizationId, userId } = stateData;

    // Get provider
    const provider = providerRegistry.getProvider(providerName);

    if (!provider || provider.type !== 'oauth2') {
      throw new Error(`Invalid provider: ${providerName}`);
    }

    // CRITICAL: The redirect URI must match EXACTLY what was used in the authorization request
    // Always use Firebase Functions callback URL (consistent with initiateOAuth)
    const oauthCallbackUrl = 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback';
    const redirectUri = oauthCallbackUrl;

    console.log(`🔍 [OAuthService] Exchanging code for tokens`, {
      provider: providerName,
      organizationId,
      redirectUri,
      codeLength: code.length
    });

    const tokens = await (provider as OAuthProvider).exchangeCodeForTokens(
      code,
      redirectUri, // Must match the redirectUri used in getAuthUrl
      organizationId
    );

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : undefined;

    // Special handling for Slack - save to slackConnections collection
    if (providerName === 'slack') {
      // Slack-specific connection format
      const slackConnectionData: any = {
        organizationId,
        type: 'user', // Default to user connection type
        userId: userId || null,
        workspaceId: tokens.accountInfo.id, // team_id from Slack
        workspaceName: tokens.accountInfo.name, // team name from Slack
        teamId: tokens.accountInfo.id,
        accessToken: encryptedAccessToken,
        scopes: tokens.scopes,
        connectedBy: userId || 'system',
        isActive: true,
        connectedAt: Timestamp.now(),
        lastRefreshedAt: Timestamp.now()
      };

      // Only add refreshToken if it exists
      if (encryptedRefreshToken) {
        slackConnectionData.refreshToken = encryptedRefreshToken;
      }

      // Save to slackConnections collection (using .add() to create new document)
      const slackConnectionRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('slackConnections')
        .add(slackConnectionData);

      console.log(`✅ [OAuthService] Saved Slack connection to slackConnections/${slackConnectionRef.id}`);

      // Also save to cloudIntegrations for compatibility
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('slack')
        .set({
          provider: 'slack',
          accountEmail: tokens.accountInfo.email || '',
          accountName: tokens.accountInfo.name,
          accountId: tokens.accountInfo.id,
          connectionId: slackConnectionRef.id, // Reference to the actual connection
          isActive: true,
          connectedAt: Timestamp.now(),
          connectedBy: userId,
          organizationId
        });
    } else if (providerName === 'dropbox') {
      // Dropbox-specific connection format
      const dropboxConnectionData: any = {
        organizationId,
        type: 'organization',
        userId: userId || null,
        accountEmail: tokens.accountInfo.email || '',
        accountName: tokens.accountInfo.name || 'Dropbox User',
        accountId: tokens.accountInfo.id,
        accessToken: encryptedAccessToken,
        scopes: tokens.scopes,
        connectedBy: userId || 'system',
        isActive: true,
        connectedAt: Timestamp.now(),
        lastRefreshedAt: Timestamp.now()
      };

      if (encryptedRefreshToken) {
        dropboxConnectionData.refreshToken = encryptedRefreshToken;
      }

      if (tokens.expiresAt) {
        dropboxConnectionData.tokenExpiresAt = Timestamp.fromDate(tokens.expiresAt);
      }

      // Save to dropboxConnections collection
      const dropboxConnectionRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('dropboxConnections')
        .add(dropboxConnectionData);

      console.log(`✅ [OAuthService] Saved Dropbox connection to dropboxConnections/${dropboxConnectionRef.id}`);
    }

    // Build connection data (for ALL providers, including Slack for multi-workspaces/backwards compatibility)
    const connectionData: any = {
      provider: providerName,
      accountEmail: tokens.accountInfo.email,
      accountName: tokens.accountInfo.name,
      accountId: tokens.accountInfo.id,
      accessToken: encryptedAccessToken,
      tokenExpiresAt: tokens.expiresAt ? Timestamp.fromDate(tokens.expiresAt) : null,
      scopes: tokens.scopes,
      isActive: true,
      connectedAt: Timestamp.now(),
      connectedBy: userId,
      lastRefreshedAt: Timestamp.now(),
      organizationId
    };

    // Only add refreshToken if it exists
    if (encryptedRefreshToken) {
      connectionData.refreshToken = encryptedRefreshToken;
    }

    // Create standardized encryptedTokens field for ALL providers (for cross-system compatibility)
    try {
      const unifiedTokens = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || '',
        expiresAt: tokens.expiresAt ? (tokens.expiresAt instanceof Date ? tokens.expiresAt.getTime() : tokens.expiresAt) : null
      };
      connectionData.encryptedTokens = encryptTokens(unifiedTokens);
      console.log(`✅ [OAuthService] Created standardized encryptedTokens for ${providerName}`);
    } catch (encryptError) {
      console.warn(`⚠️ [OAuthService] Failed to create encryptedTokens for ${providerName}:`, encryptError);
    }

    // Use set with merge: true to preserve existing fields like refreshToken if not provided in connectionData
    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc(providerName)
      .set(connectionData, { merge: true });

    console.log(`✅ [OAuthService] Successfully saved ${providerName} connection with merge`);


    // Delete used state
    await stateDoc.ref.delete();

    // Use redirect URL from state (stored during initiation)
    // This should ALWAYS be present - if not, it's an error
    if (!stateData.redirectUrl) {
      console.error(`❌ [OAuthService] redirectUrl missing from state!`, {
        state: state.substring(0, 8) + '...',
        stateDataKeys: Object.keys(stateData)
      });
      throw new Error('OAuth state missing redirectUrl - cannot redirect');
    }

    const redirectUrl = stateData.redirectUrl;

    console.log(`🔄 [OAuthService] Preparing redirect`, {
      storedRedirectUrl: stateData.redirectUrl,
      finalRedirectUrl: redirectUrl,
      provider: providerName,
      isLocalhost: redirectUrl.includes('localhost'),
      isHubUrl: redirectUrl.includes('localhost:5300') || redirectUrl.includes('hub'),
      redirectUrlLength: redirectUrl?.length
    });

    // Ensure redirect URL has the success parameter
    // Parse URL carefully to handle existing query params
    let finalRedirectUrl: string;
    try {
      const url = new URL(redirectUrl);
      // Clear any existing oauth params to avoid duplicates
      url.searchParams.delete('oauth_success');
      url.searchParams.delete('oauth_error');
      url.searchParams.delete('provider');
      // Set success params
      url.searchParams.set('oauth_success', 'true');
      url.searchParams.set('provider', providerName);
      finalRedirectUrl = url.toString();
    } catch (urlError: any) {
      // If URL parsing fails, try to construct it manually
      console.warn(`⚠️ [OAuthService] URL parsing failed, attempting manual construction:`, urlError.message);
      const separator = redirectUrl.includes('?') ? '&' : '?';
      finalRedirectUrl = `${redirectUrl}${separator}oauth_success=true&provider=${providerName}`;
    }
    
    console.log(`✅ [OAuthService] OAuth callback successful, redirecting to: ${finalRedirectUrl}`);
    console.log(`🔍 [OAuthService] Redirect URL details:`, {
      original: stateData.redirectUrl,
      final: finalRedirectUrl,
      isHub: finalRedirectUrl.includes('localhost:5300') || finalRedirectUrl.includes('hub'),
      hasQueryParams: finalRedirectUrl.includes('?')
    });

    return {
      success: true,
      redirectUrl: finalRedirectUrl
    };
  }

  /**
   * Refresh connection for any provider
   */
  async refreshConnection(
    organizationId: string,
    providerName: string
  ): Promise<void> {
    const provider = providerRegistry.getProvider(providerName);

    if (!provider || provider.type !== 'oauth2') {
      throw new Error(`Invalid provider: ${providerName}`);
    }

    // Get connection
    const connectionDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc(providerName)
      .get();

    if (!connectionDoc.exists) {
      console.error(`[refreshConnection] Connection not found for ${providerName} in org ${organizationId}`);
      throw new Error('Connection not found');
    }

    const connectionData = connectionDoc.data()!;

    // Log connection data structure (without sensitive data)
    console.log(`[refreshConnection] Connection data structure for ${providerName}:`, {
      hasAccessToken: !!connectionData.accessToken,
      hasRefreshToken: !!connectionData.refreshToken,
      hasEncryptedTokens: !!connectionData.encryptedTokens,
      isActive: connectionData.isActive,
      accountEmail: connectionData.accountEmail,
      fields: Object.keys(connectionData)
    });

    if (!connectionData.refreshToken) {
      console.error(`[refreshConnection] No refresh token found for ${providerName} in org ${organizationId}`);
      console.error(`[refreshConnection] Available fields:`, Object.keys(connectionData));
      throw new Error('No refresh token available');
    }

    // Decrypt refresh token
    let refreshToken: string;
    try {
      refreshToken = decryptToken(connectionData.refreshToken);
      console.log(`[refreshConnection] Successfully decrypted refresh token for ${providerName}`);
    } catch (decryptError: any) {
      console.error(`[refreshConnection] Failed to decrypt refresh token for ${providerName}:`, decryptError?.message);
      // Check if token might be plain text (not encrypted)
      if (typeof connectionData.refreshToken === 'string' && !connectionData.refreshToken.includes(':')) {
        console.warn(`[refreshConnection] Refresh token appears to be plain text, attempting to use directly`);
        refreshToken = connectionData.refreshToken;
      } else {
        throw new Error(`Failed to decrypt refresh token: ${decryptError?.message}`);
      }
    }

    // Refresh tokens
    const newTokens = await (provider as OAuthProvider).refreshTokens(refreshToken, organizationId);

    // Encrypt new tokens
    const encryptedAccessToken = encryptToken(newTokens.accessToken);
    const encryptedRefreshToken = newTokens.refreshToken
      ? encryptToken(newTokens.refreshToken)
      : connectionData.refreshToken; // Keep existing if not provided

    // Update connection
    await connectionDoc.ref.update({
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt: newTokens.expiresAt ? Timestamp.fromDate(newTokens.expiresAt) : null,
      lastRefreshedAt: Timestamp.now()
    });

    console.log(`✅ [refreshConnection] Successfully refreshed tokens for ${providerName} in org ${organizationId}`);
  }

  /**
   * Revoke connection for any provider
   */
  async revokeConnection(
    organizationId: string,
    providerName: string
  ): Promise<void> {
    const provider = providerRegistry.getProvider(providerName);

    if (!provider || provider.type !== 'oauth2') {
      throw new Error(`Invalid provider: ${providerName}`);
    }

    // Get connection
    const connectionDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc(providerName)
      .get();

    if (!connectionDoc.exists) {
      throw new Error('Connection not found');
    }

    const connectionData = connectionDoc.data()!;

    // Try to decrypt access token and revoke with provider
    // If decryption fails (e.g., key mismatch), skip revocation but still delete the connection
    let accessToken: string | null = null;
    try {
      accessToken = decryptToken(connectionData.accessToken);
      console.log(`✅ [OAuthService] Successfully decrypted token for ${providerName} revocation`);
    } catch (decryptError: any) {
      console.warn(`⚠️ [OAuthService] Failed to decrypt token for ${providerName}:`, decryptError.message);
      console.warn(`⚠️ [OAuthService] Skipping provider revocation, will delete connection document anyway`);
      // Don't throw - we still want to delete the connection document
    }

    // Revoke with provider (only if we successfully decrypted the token)
    if (accessToken) {
      try {
        await (provider as OAuthProvider).revokeAccess(accessToken, organizationId);
        console.log(`✅ [OAuthService] Successfully revoked ${providerName} access with provider`);
      } catch (revokeError) {
        console.warn(`⚠️ [OAuthService] Failed to revoke ${providerName} with provider:`, revokeError);
        // Continue anyway - we still want to delete the connection document
      }
    } else {
      console.log(`⏭️ [OAuthService] Skipping provider revocation for ${providerName} (token decryption failed)`);
    }

    // 🔥 FIXED: Delete the connection document instead of marking inactive
    // This allows proper reconnection via OAuth flow
    // This happens regardless of whether revocation succeeded
    await connectionDoc.ref.delete();
    console.log(`✅ [OAuthService] Deleted ${providerName} connection document for org ${organizationId}`);
  }
}

export const oauthService = new UnifiedOAuthService();

