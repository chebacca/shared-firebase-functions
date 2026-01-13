/**
 * Unified OAuth Cloud Functions
 * 
 * Single set of functions that work with ANY registered provider
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { oauthService } from './OAuthService';
import { providerRegistry } from './ProviderRegistry';
import { FeatureAccessService } from './FeatureAccessService';
import { encryptionKey } from './encryption';
import { db } from '../../shared/utils';
import * as admin from 'firebase-admin';
import { OAuthProvider } from './types';

/**
 * Callable function - initiate OAuth for ANY registered provider
 */
export const initiateOAuth = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const data = request.data;
    const provider = data.provider || data.providerName;
    const organizationId = data.organizationId;
    const returnUrl = data.returnUrl || data.redirectUri;

    // Validate provider exists
    if (!providerRegistry.hasProvider(provider)) {
      throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }

    // Validate user is org member
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!request.auth.token.organizationId || request.auth.token.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Not authorized for this organization');
    }

    // Check if user is admin (for organization-level connections)
    const userRole = request.auth.token.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Admin role required to connect integrations');
    }

    // Initiate OAuth with return URL
    const result = await oauthService.initiateOAuth(
      provider,
      organizationId,
      request.auth.uid,
      returnUrl // Pass return URL to store in state
    );

    return result;
  }
);

/**
 * HTTP function - handle OAuth callback for ANY registered provider
 */
export const handleOAuthCallback = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      console.warn(`⚠️ [handleOAuthCallback] OAuth error from provider: ${error}`);

      // Get redirect URL from state - should always exist
      const { db } = await import('../../shared/utils');
      let baseUrl: string | null = null;

      if (state) {
        try {
          const stateDoc = await db.collection('oauthStates').doc(state as string).get();
          if (stateDoc.exists) {
            const stateData = stateDoc.data();
            if (stateData?.redirectUrl) {
              baseUrl = stateData.redirectUrl;
              console.log(`✅ [handleOAuthCallback] Using redirect URL from state: ${baseUrl}`);
            } else {
              console.error(`❌ [handleOAuthCallback] State exists but redirectUrl missing!`);
            }
          } else {
            console.error(`❌ [handleOAuthCallback] State document not found: ${(state as string).substring(0, 8)}...`);
          }
        } catch (stateError) {
          console.error(`❌ [handleOAuthCallback] Error retrieving state:`, stateError);
        }
      }

      // If we couldn't get redirectUrl from state, we can't redirect properly
      if (!baseUrl) {
        console.error(`❌ [handleOAuthCallback] Cannot redirect - no redirectUrl available`);
        res.status(400).send(`
          <html>
            <body>
              <h1>OAuth Error</h1>
              <p>Error: ${error}</p>
              <p>Unable to determine redirect URL. Please return to the application and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      return res.redirect(`${baseUrl}?oauth_error=${error}`);
    }

    if (!code || !state) {
      console.warn(`⚠️ [handleOAuthCallback] Missing parameters`, { hasCode: !!code, hasState: !!state });

      // Get redirect URL from state - should always exist
      const { db } = await import('../../shared/utils');
      let baseUrl: string | null = null;

      if (state) {
        try {
          const stateDoc = await db.collection('oauthStates').doc(state as string).get();
          if (stateDoc.exists) {
            const stateData = stateDoc.data();
            if (stateData?.redirectUrl) {
              baseUrl = stateData.redirectUrl;
              console.log(`✅ [handleOAuthCallback] Using redirect URL from state: ${baseUrl}`);
            } else {
              console.error(`❌ [handleOAuthCallback] State exists but redirectUrl missing!`);
            }
          } else {
            console.error(`❌ [handleOAuthCallback] State document not found`);
          }
        } catch (stateError) {
          console.error(`❌ [handleOAuthCallback] Error retrieving state:`, stateError);
        }
      }

      // If we couldn't get redirectUrl from state, we can't redirect properly
      if (!baseUrl) {
        console.error(`❌ [handleOAuthCallback] Cannot redirect - no redirectUrl available`);
        res.status(400).send(`
          <html>
            <body>
              <h1>OAuth Error</h1>
              <p>Missing required parameters (code or state).</p>
              <p>Unable to determine redirect URL. Please return to the application and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // Get provider from state if available
      let providerParam = '';
      if (state) {
        try {
          const stateDoc = await db.collection('oauthStates').doc(state as string).get();
          if (stateDoc.exists) {
            const stateData = stateDoc.data();
            if (stateData?.provider) {
              providerParam = `&provider=${stateData.provider}`;
            }
          }
        } catch (stateError) {
          console.warn(`⚠️ [handleOAuthCallback] Could not get provider from state for error redirect:`, stateError);
        }
      }

      return res.redirect(`${baseUrl}?oauth_error=missing_parameters${providerParam}`);
    }

    try {
      const result = await oauthService.handleCallback(
        code as string,
        state as string
      );

      return res.redirect(result.redirectUrl);
    } catch (error: any) {
      console.error('❌ [handleOAuthCallback] OAuth callback error:', error);

      // Get redirect URL from state - should always exist
      const { db } = await import('../../shared/utils');

      // Get provider from state for error logging
      let providerName = 'unknown';
      if (state) {
        try {
          const stateDoc = await db.collection('oauthStates').doc(state as string).get();
          if (stateDoc.exists) {
            providerName = stateDoc.data()?.provider || 'unknown';
          }
        } catch (e) {
          // Ignore errors getting provider
        }
      }

      console.error('❌ [handleOAuthCallback] Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack?.substring(0, 500),
        name: error?.name,
        provider: providerName
      });
      let baseUrl: string | null = null;

      if (state) {
        try {
          const stateDoc = await db.collection('oauthStates').doc(state as string).get();
          if (stateDoc.exists) {
            const stateData = stateDoc.data();
            if (stateData?.redirectUrl) {
              baseUrl = stateData.redirectUrl;
              console.log(`✅ [handleOAuthCallback] Using redirect URL from state: ${baseUrl}`);
            } else {
              console.error(`❌ [handleOAuthCallback] State exists but redirectUrl missing!`);
            }
          } else {
            console.error(`❌ [handleOAuthCallback] State document not found for error redirect`);
          }
        } catch (stateError) {
          console.error(`❌ [handleOAuthCallback] Error retrieving state for redirect:`, stateError);
        }
      }

      // Determine error type
      const errorMessage = error?.message || 'callback_failed';
      let errorParam = 'callback_failed';

      if (errorMessage.includes('expired') || errorMessage.includes('Invalid or expired state')) {
        errorParam = 'session_expired';
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
        errorParam = 'invalid_state';
      } else if (errorMessage.includes('credentials not configured') || errorMessage.includes('not configured')) {
        errorParam = 'configuration_error';
      } else if (errorMessage.includes('redirect_uri_mismatch') || errorMessage.includes('redirect URI')) {
        errorParam = 'redirect_uri_mismatch';
      }

      // If we couldn't get redirectUrl from state, we can't redirect properly
      if (!baseUrl) {
        console.error(`❌ [handleOAuthCallback] Cannot redirect - no redirectUrl available. Error: ${errorMessage}`);
        res.status(400).send(`
          <html>
            <body>
              <h1>OAuth Error</h1>
              <p>Error: ${errorMessage}</p>
              <p>Unable to determine redirect URL. Please return to the application and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // Update providerName if we got it from state (reuse the variable declared earlier)
      if (state && providerName === 'unknown') {
        try {
          const stateDoc = await db.collection('oauthStates').doc(state as string).get();
          if (stateDoc.exists) {
            const stateData = stateDoc.data();
            if (stateData?.provider) {
              providerName = stateData.provider;
            }
          }
        } catch (stateError) {
          console.warn(`⚠️ [handleOAuthCallback] Could not get provider from state for error redirect:`, stateError);
        }
      }

      // Parse URL properly to handle existing query params
      try {
        const url = new URL(baseUrl);
        // Clear any existing oauth params to avoid duplicates
        url.searchParams.delete('oauth_success');
        url.searchParams.delete('oauth_error');
        url.searchParams.delete('provider');
        // Set error params
        url.searchParams.set('oauth_error', errorParam);
        url.searchParams.set('provider', providerName);

        const errorRedirectUrl = url.toString();
        console.log(`🔄 [handleOAuthCallback] Redirecting to error URL: ${errorRedirectUrl}`);
        return res.redirect(errorRedirectUrl);
      } catch (urlError) {
        // If URL parsing fails, fall back to simple concatenation
        console.warn(`⚠️ [handleOAuthCallback] URL parsing failed, using simple redirect:`, urlError);
        return res.redirect(`${baseUrl}?oauth_error=${errorParam}&provider=${providerName}`);
      }
    }
  }
);

/**
 * Callable function - refresh token for ANY registered provider
 */
export const refreshOAuthToken = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { provider, organizationId } = request.data;

      // Validate input
      if (!provider || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters: provider and organizationId');
      }

      // Validate provider exists
      if (!providerRegistry.hasProvider(provider)) {
        throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
      }

      // Validate authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      if (!request.auth.token.organizationId || request.auth.token.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'Not authorized for this organization');
      }

      // Refresh connection
      await oauthService.refreshConnection(organizationId, provider);

      return { success: true };
    } catch (error: any) {
      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }

      // Log the error for debugging
      console.error(`[refreshOAuthToken] Error refreshing token for ${request.data?.provider}:`, error);

      // Convert common errors to appropriate HttpsErrors
      const errorMessage = error?.message || 'Unknown error occurred';

      if (errorMessage.includes('Connection not found') || errorMessage.includes('not found')) {
        throw new HttpsError('not-found', 'OAuth connection not found. Please reconnect the integration.');
      }

      if (errorMessage.includes('No refresh token') || errorMessage.includes('refresh token')) {
        throw new HttpsError('failed-precondition', 'No refresh token available. Please reconnect the integration.');
      }

      if (errorMessage.includes('Invalid provider')) {
        throw new HttpsError('invalid-argument', `Invalid provider configuration: ${request.data?.provider}`);
      }

      if (errorMessage.includes('invalid_grant') || errorMessage.includes('Token has been expired or revoked')) {
        throw new HttpsError('failed-precondition', 'Refresh token is invalid or expired. Please reconnect the integration.');
      }

      // For any other error, return a generic internal error
      throw new HttpsError('internal', `Failed to refresh OAuth token: ${errorMessage}`);
    }
  }
);

/**
 * Callable function - update account info for Box/Dropbox connections
 * Fetches account info from provider API and updates Firestore
 */
export const updateOAuthAccountInfo = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { provider, organizationId } = request.data;

    // Validate
    if (!providerRegistry.hasProvider(provider)) {
      throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }

    if (!request.auth || request.auth.token.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }

    // Only support Box and Dropbox for now
    if (provider !== 'box' && provider !== 'dropbox') {
      throw new HttpsError('invalid-argument', `Account info update only supported for box and dropbox`);
    }

    try {
      // Get connection from Firestore
      const connectionDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(provider)
        .get();

      if (!connectionDoc.exists) {
        throw new HttpsError('not-found', 'Connection not found');
      }

      const connectionData = connectionDoc.data()!;

      // Decrypt access token
      const { decryptToken } = await import('./encryption');
      const accessToken = decryptToken(connectionData.accessToken);

      let accountEmail = '';
      let accountName = '';
      let accountId = '';

      if (provider === 'box') {
        // Use Box REST API to get current user info
        // This is more reliable than the Box SDK which has initialization issues
        const response = await fetch('https://api.box.com/2.0/users/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [updateOAuthAccountInfo] Box API error: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Box API error: ${response.status} ${response.statusText}`);
        }

        const user = await response.json() as any;

        accountEmail = user.login || user.email || '';
        accountName = user.name || '';
        accountId = user.id || '';
      } else if (provider === 'dropbox') {
        // Use Dropbox API to get current account
        const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to get Dropbox account info');
        }

        const data = await response.json();
        accountEmail = (data as any).email || '';
        accountName = (data as any).name?.display_name || (data as any).name?.given_name || '';
        accountId = (data as any).account_id || '';
      }

      // Update connection document with account info
      await connectionDoc.ref.update({
        accountEmail,
        accountName,
        accountId: accountId || connectionData.accountId || '',
        lastRefreshedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ [updateOAuthAccountInfo] Updated ${provider} account info:`, {
        accountEmail,
        accountName,
        accountId
      });

      return {
        success: true,
        accountEmail,
        accountName,
        accountId
      };
    } catch (error: any) {
      console.error(`❌ [updateOAuthAccountInfo] Failed to update ${provider} account info:`, error);
      throw new HttpsError('internal', error.message || 'Failed to update account info');
    }
  }
);

/**
 * Callable function - revoke connection for ANY registered provider
 */
export const revokeOAuthConnection = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { provider, organizationId } = request.data;

    // Validate
    if (!providerRegistry.hasProvider(provider)) {
      throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }

    if (!request.auth || request.auth.token.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }

    // Check if user is admin
    const userRole = request.auth.token.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Admin role required to disconnect integrations');
    }

    // Revoke
    await oauthService.revokeConnection(organizationId, provider);

    return { success: true };
  }
);

/**
 * Callable function - disconnect integration (alias for revokeOAuthConnection)
 * This is a simpler interface that matches what some services expect
 */
export const disconnectIntegration = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { provider } = request.data;

    // Get organizationId from auth token or request data
    const organizationId = request.auth?.token?.organizationId || request.data?.organizationId;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

    // Validate provider exists
    if (!providerRegistry.hasProvider(provider)) {
      throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }

    // Validate user is authenticated and belongs to organization
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Allow users to disconnect if they belong to the organization
    // Organization-level integrations can be disconnected by any org member
    const userOrgId = request.auth.token.organizationId;
    if (userOrgId !== organizationId) {
      throw new HttpsError('permission-denied', 'Not authorized for this organization');
    }

    // ✅ FIXED: Allow any organization member to disconnect (not just admins)
    // Organization-level integrations are shared, so any member can disconnect

    // Slack uses a different structure (slackConnections subcollection)
    if (provider === 'slack') {
      const { connectionId } = request.data;

      if (!connectionId) {
        // No specific connection ID - client already deleted it, that's fine
        console.log(`[disconnectIntegration] Slack connection already removed client-side for org ${organizationId}`);
        return { success: true, message: 'Connection already removed' };
      }

      // Check if the specific Slack connection exists
      const slackConnectionRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('slackConnections')
        .doc(connectionId);

      const slackConnectionDoc = await slackConnectionRef.get();

      if (!slackConnectionDoc.exists) {
        console.log(`[disconnectIntegration] Slack connection ${connectionId} already removed for org ${organizationId}`);
        return { success: true, message: 'Connection already removed' };
      }

      // Connection exists - delete it (Slack doesn't use OAuth revoke like other providers)
      try {
        await slackConnectionRef.delete();
        console.log(`[disconnectIntegration] Slack connection ${connectionId} deleted for org ${organizationId}`);
        return { success: true };
      } catch (error: any) {
        console.error(`[disconnectIntegration] Error deleting Slack connection:`, error);
        throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to disconnect Slack integration');
      }
    }

    // For other providers, use cloudIntegrations collection
    const connectionRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc(provider);

    const connectionDoc = await connectionRef.get();

    // If connection doesn't exist, it was already deleted client-side - that's fine
    if (!connectionDoc.exists) {
      console.log(`[disconnectIntegration] Connection already removed for ${provider} in org ${organizationId}`);
      return { success: true, message: 'Connection already removed' };
    }

    // Connection exists, revoke it
    try {
      await oauthService.revokeConnection(organizationId, provider);
      return { success: true };
    } catch (error: any) {
      console.error(`[disconnectIntegration] Error revoking connection:`, error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to disconnect integration');
    }
  }
);

/**
 * Callable function - list all available providers
 */
export const listAvailableProviders = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    const providers = providerRegistry.getAllProviders();

    return {
      providers: providers.map(p => ({
        name: p.name,
        displayName: p.displayName,
        type: p.type
      }))
    };
  }
);

/**
 * Callable function - verify connection has required scopes for app features
 */
export const verifyIntegrationAccess = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { appName, provider, organizationId } = request.data;

    // Validate
    if (!providerRegistry.hasProvider(provider)) {
      throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }

    if (!request.auth || request.auth.token.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }

    // Get features app needs
    const features = FeatureAccessService.getAppFeatures(appName as any, provider as any);

    // Verify scopes
    const verification = await FeatureAccessService.verifyScopes(
      organizationId,
      provider as any,
      features
    );

    return {
      hasAccess: verification.hasAccess,
      missingScopes: verification.missingScopes,
      requiredFeatures: features,
      appName,
      provider
    };
  }
);

