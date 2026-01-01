/**
 * Box OAuth Provider
 * 
 * Implements OAuth 2.0 flow for Box integration
 * Based on official Box OAuth 2.0 documentation
 */

import { OAuthProvider, OAuthInitParams, TokenSet, ProviderConfig, AccountInfo } from '../types';
import { db } from '../../../shared/utils';
import { FeatureAccessService } from '../FeatureAccessService';

export class BoxProvider implements OAuthProvider {
  name = 'box';
  displayName = 'Box';
  type = 'oauth2' as const;
  
  authorizationEndpoint = 'https://account.box.com/api/oauth2/authorize';
  tokenEndpoint = 'https://api.box.com/oauth2/token';
  revokeEndpoint = 'https://api.box.com/oauth2/revoke';
  
  // Required scopes (Box only supports ONE scope: root_readwrite)
  // This is a getter that returns the single scope Box supports
  get requiredScopes(): string[] {
    return ['root_readwrite'];
  }
  
  // Union of all scopes needed by all apps
  // NOTE: Box only allows ONE scope at a time. root_readwrite includes read access, so we use that.
  private getAllScopes(): string[] {
    const allScopes = FeatureAccessService.getAllRequiredScopesForProvider('box');
    // Box doesn't support multiple scopes - if both root_readwrite and root_readonly are present,
    // use only root_readwrite (it includes read access)
    if (allScopes.includes('root_readwrite')) {
      return ['root_readwrite'];
    }
    // Fallback to root_readonly if root_readwrite isn't present (shouldn't happen in practice)
    return allScopes.length > 0 ? [allScopes[0]] : ['root_readwrite'];
  }
  
  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(params: OAuthInitParams): Promise<string> {
    const config = await this.getConfig(params.organizationId);
    
    // Get the single scope to use (Box only supports one scope)
    // CRITICAL: Box doesn't support multiple scopes - must use only one
    const scopes = this.getAllScopes();
    let scope = scopes[0]; // Box only allows one scope
    
    // Double-check: if scope contains spaces (multiple scopes), use only root_readwrite
    if (scope && (scope.includes(' ') || scope.includes('+'))) {
      console.warn(`⚠️ [BoxProvider] Multiple scopes detected in getAllScopes result: "${scope}", using root_readwrite`);
      scope = 'root_readwrite';
    }
    
    // Also check if config has a scope that might override (shouldn't happen, but be safe)
    // IGNORE config scope for Box - always use root_readwrite
    const configScope = config.additionalParams?.scope;
    if (configScope) {
      if (typeof configScope === 'string' && (configScope.includes(' ') || configScope.includes('+'))) {
        console.warn(`⚠️ [BoxProvider] Config has multiple scopes: "${configScope}", ignoring and using root_readwrite`);
        scope = 'root_readwrite';
      } else if (typeof configScope === 'string' && configScope !== 'root_readwrite') {
        console.warn(`⚠️ [BoxProvider] Config has non-standard scope: "${configScope}", using root_readwrite instead`);
        scope = 'root_readwrite';
      }
    }
    
    // FINAL CHECK: Ensure we only have ONE scope (root_readwrite)
    // Box API will reject if multiple scopes are sent - ALWAYS use root_readwrite
    const finalScope: string = 'root_readwrite';
    
    console.log(`✅ [BoxProvider] Using Box OAuth scope: ${finalScope} (Box only supports single scope)`);
    
    const authUrl = new URL(this.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', params.redirectUri);
    authUrl.searchParams.set('scope', finalScope); // ALWAYS single scope: root_readwrite
    authUrl.searchParams.set('state', params.state);
    
    return authUrl.toString();
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string, organizationId: string): Promise<TokenSet> {
    const config = await this.getConfig(organizationId);
    
    // Box SDK for token exchange
    const BoxSDK = require('box-node-sdk');
    const boxSDK = new BoxSDK({
      clientID: config.clientId,
      clientSecret: config.clientSecret
    });
    
    // Exchange code for access token
    let tokenInfo: any;
    try {
      tokenInfo = await boxSDK.getTokensAuthorizationCodeGrant(code, {
        redirectURI: redirectUri
      });
    } catch (tokenError: any) {
      console.error('❌ [BoxProvider] Token exchange failed:', tokenError);
      throw new Error(`Token exchange failed: ${tokenError?.message || tokenError}`);
    }
    
    if (!tokenInfo || !tokenInfo.accessToken) {
      throw new Error('Token exchange succeeded but no access_token received');
    }
    
    // Get user info
    const client = boxSDK.getBasicClient(tokenInfo.accessToken);
    let userInfo: any;
    try {
      const user = await client.users.getCurrentUser();
      userInfo = {
        email: user.login,
        name: user.name,
        id: user.id
      };
    } catch (error) {
      console.warn('⚠️ [BoxProvider] Failed to get user info, using defaults');
      userInfo = {
        email: '',
        name: '',
        id: ''
      };
    }
    
    return {
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken,
      expiresAt: tokenInfo.expiresIn ? new Date(Date.now() + tokenInfo.expiresIn * 1000) : undefined,
      scopes: this.getAllScopes(), // Use the same scope logic
      accountInfo: userInfo
    };
  }
  
  /**
   * Refresh expired access token
   */
  async refreshTokens(refreshToken: string, organizationId: string): Promise<TokenSet> {
    const config = await this.getConfig(organizationId);
    
    const BoxSDK = require('box-node-sdk');
    const boxSDK = new BoxSDK({
      clientID: config.clientId,
      clientSecret: config.clientSecret
    });
    
    // Refresh token
    let tokenInfo: any;
    try {
      tokenInfo = await boxSDK.getTokensRefreshGrant(refreshToken);
    } catch (error: any) {
      throw new Error(`Token refresh failed: ${error?.message || error}`);
    }
    
    if (!tokenInfo || !tokenInfo.accessToken) {
      throw new Error('Token refresh failed - no access token received');
    }
    
    // Get updated user info
    const client = boxSDK.getBasicClient(tokenInfo.accessToken);
    let userInfo: any;
    try {
      const user = await client.users.getCurrentUser();
      userInfo = {
        email: user.login,
        name: user.name,
        id: user.id
      };
    } catch (error) {
      console.warn('⚠️ [BoxProvider] Failed to get user info during refresh');
      userInfo = {
        email: '',
        name: '',
        id: ''
      };
    }
    
    return {
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken || refreshToken,
      expiresAt: tokenInfo.expiresIn ? new Date(Date.now() + tokenInfo.expiresIn * 1000) : undefined,
      scopes: this.getAllScopes(), // Use the same scope logic
      accountInfo: userInfo
    };
  }
  
  /**
   * Revoke access token
   */
  async revokeAccess(accessToken: string, organizationId: string): Promise<void> {
    const config = await this.getConfig(organizationId);
    try {
      const response = await fetch(this.revokeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: accessToken,
          client_id: config.clientId,
          client_secret: config.clientSecret
        })
      });

      if (!response.ok) {
        console.warn('⚠️ [BoxProvider] Box API returned error during revocation');
      }
    } catch (error) {
      console.warn('⚠️ [BoxProvider] Failed to revoke token with Box API:', error);
      // Continue anyway
    }
  }
  
  /**
   * Validate that connection still works
   */
  async validateConnection(tokens: TokenSet): Promise<boolean> {
    try {
      const BoxSDK = require('box-node-sdk');
      const boxSDK = new BoxSDK({
        clientID: (await this.getConfig('')).clientId,
        clientSecret: (await this.getConfig('')).clientSecret
      });
      
      const client = boxSDK.getBasicClient(tokens.accessToken);
      
      // Make a test API call
      await client.users.getCurrentUser();
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get provider configuration
   */
  async getConfig(organizationId: string): Promise<ProviderConfig> {
    console.log(`🔍 [BoxProvider] getConfig START - organizationId: "${organizationId}", type: ${typeof organizationId}, length: ${organizationId?.length}`);
    // Option 1: Get from Firestore (per-organization config)
    // Check integrationSettings first (current location)
    if (organizationId && organizationId.trim()) {
      console.log(`🔍 [BoxProvider] organizationId is valid, checking Firestore...`);
      const settingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('box')
        .get();
      
      console.log(`🔍 [BoxProvider] Firestore document exists: ${settingsDoc.exists}`);
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data()!;
        console.log(`🔍 [BoxProvider] Document data:`, {
          hasIsConfigured: !!data.isConfigured,
          isConfigured: data.isConfigured,
          hasClientId: !!data.clientId,
          hasClientSecret: !!data.clientSecret,
          clientIdLength: data.clientId?.length
        });
        
        // Check each field individually to debug why condition might fail
        const hasIsConfigured = !!data.isConfigured;
        const hasClientId = !!data.clientId;
        const hasClientSecret = !!data.clientSecret;
        
        console.log(`🔍 [BoxProvider] Credential check:`, {
          isConfigured: data.isConfigured,
          hasIsConfigured,
          clientId: data.clientId ? `${data.clientId.substring(0, 10)}...` : 'MISSING',
          hasClientId,
          clientSecret: data.clientSecret ? `${data.clientSecret.substring(0, 10)}...` : 'MISSING',
          hasClientSecret,
          clientSecretType: typeof data.clientSecret,
          clientSecretLength: data.clientSecret?.length,
          allFieldsPresent: hasIsConfigured && hasClientId && hasClientSecret
        });
        
        if (hasIsConfigured && hasClientId && hasClientSecret) {
          // Decrypt client secret if encrypted
          let clientSecret = data.clientSecret;
          if (clientSecret.includes(':')) {
            try {
              const { decryptToken } = await import('../encryption');
              clientSecret = decryptToken(clientSecret);
            } catch (error) {
              console.warn('Failed to decrypt client secret, using as-is');
            }
          }
          
          // CRITICAL: Box only supports ONE scope. Ignore config.scope if it has multiple scopes.
          let scope = data.scope || 'root_readwrite';
          if (scope && typeof scope === 'string' && scope.includes(' ')) {
            // Multiple scopes detected - Box doesn't support this, use only root_readwrite
            console.warn(`⚠️ [BoxProvider] Config has multiple scopes: "${scope}", using root_readwrite`);
            scope = 'root_readwrite';
          }
          
          return {
            clientId: data.clientId.trim(),
            clientSecret: clientSecret.trim(),
            additionalParams: {
              redirectUri: data.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
              scope: scope // Single scope only
            }
          };
        }
      }
      
      // Also check integrationConfigs (alternative location)
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('box-config')
        .get();
      
      if (configDoc.exists) {
        const data = configDoc.data()!;
        return {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          additionalParams: data.additionalParams
        };
      }
    }
    
    // Option 2: Get from environment variables (global config)
    console.log(`⚠️ [BoxProvider] No Firestore config found for organizationId: ${organizationId}, falling back to environment variables`);
    const clientId = process.env.BOX_CLIENT_ID;
    const clientSecret = process.env.BOX_CLIENT_SECRET;
    
    console.log(`🔍 [BoxProvider] Environment variables:`, {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdLength: clientId?.length
    });
    
    if (!clientId || !clientSecret) {
      console.error(`❌ [BoxProvider] No credentials found in Firestore OR environment variables for org: ${organizationId}`);
      throw new Error('Box OAuth credentials not configured. Set BOX_CLIENT_ID and BOX_CLIENT_SECRET environment variables or configure in Integration Settings.');
    }
    
    return {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      additionalParams: {
        redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback'
      }
    };
  }
}

