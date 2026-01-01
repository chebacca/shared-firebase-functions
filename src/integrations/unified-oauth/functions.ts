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
    const { provider, organizationId, returnUrl } = request.data;
    
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
    const { provider, organizationId } = request.data;
    
    // Validate
    if (!providerRegistry.hasProvider(provider)) {
      throw new HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }
    
    if (!request.auth || request.auth.token.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Not authorized');
    }
    
    // Refresh
    await oauthService.refreshConnection(organizationId, provider);
    
    return { success: true };
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

