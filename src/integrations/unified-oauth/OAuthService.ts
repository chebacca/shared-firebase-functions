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
      // If returnUrl is provided, use it (could be localhost in dev)
      // This will be the full URL like http://localhost:4001/dashboard/integrations
      redirectUrl = returnUrl;
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
      expiresIn: '1 hour'
    });
    
    // Get auth URL from provider
    const authUrl = await (provider as OAuthProvider).getAuthUrl({
      organizationId,
      userId,
      redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
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
    
    // Exchange code for tokens
    // CRITICAL: The redirect URI must match EXACTLY what was used in the authorization request
    // This is always the Firebase Function callback URL (not the return URL to the app)
    const redirectUri = 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback';
    
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
    } else {
      // Standard handling for other providers
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
      
      // For Box and Dropbox, also create encryptedTokens field (expected by refreshBoxAccessToken/refreshDropboxAccessToken)
      // This ensures compatibility with the token refresh functions that expect the unified format
      if (providerName === 'box' || providerName === 'dropbox') {
        try {
          // Use original unencrypted tokens from the tokens object
          const unifiedTokens = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || '',
            expiresAt: tokens.expiresAt ? (tokens.expiresAt instanceof Date ? tokens.expiresAt.getTime() : tokens.expiresAt) : null
          };
          
          // Encrypt using the unified format (base64-encoded binary)
          connectionData.encryptedTokens = encryptTokens(unifiedTokens);
          console.log(`✅ [OAuthService] Created encryptedTokens field for ${providerName}`);
        } catch (encryptError) {
          console.warn(`⚠️ [OAuthService] Failed to create encryptedTokens for ${providerName}, will use legacy format:`, encryptError);
          // Continue without encryptedTokens - migration logic in refresh functions will handle it
        }
      }
      
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(providerName)
        .set(connectionData);
    }
    
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
      isLocalhost: redirectUrl.includes('localhost')
    });
    
    // Ensure redirect URL has the success parameter
    // Parse URL carefully to handle existing query params
    const url = new URL(redirectUrl);
    // Clear any existing oauth params to avoid duplicates
    url.searchParams.delete('oauth_success');
    url.searchParams.delete('oauth_error');
    url.searchParams.delete('provider');
    // Set success params
    url.searchParams.set('oauth_success', 'true');
    url.searchParams.set('provider', providerName);
    
    const finalRedirectUrl = url.toString();
    console.log(`✅ [OAuthService] OAuth callback successful, redirecting to: ${finalRedirectUrl}`);
    
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
      throw new Error('Connection not found');
    }
    
    const connectionData = connectionDoc.data()!;
    
    if (!connectionData.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    // Decrypt refresh token
    const refreshToken = decryptToken(connectionData.refreshToken);
    
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
    
    // Decrypt access token
    const accessToken = decryptToken(connectionData.accessToken);
    
    // Revoke with provider
    try {
      await (provider as OAuthProvider).revokeAccess(accessToken, organizationId);
    } catch (error) {
      console.warn(`Failed to revoke with provider:`, error);
      // Continue anyway
    }
    
    // Mark as inactive
    await connectionDoc.ref.update({
      isActive: false,
      disconnectedAt: Timestamp.now()
    });
  }
}

export const oauthService = new UnifiedOAuthService();

