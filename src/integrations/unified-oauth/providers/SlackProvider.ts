/**
 * Slack OAuth Provider
 * 
 * Implements OAuth v2 flow for Slack integration
 * Based on official Slack OAuth v2 documentation
 */

import { OAuthProvider, OAuthInitParams, TokenSet, ProviderConfig, AccountInfo } from '../types';
import { db } from '../../../shared/utils';
import { FeatureAccessService } from '../FeatureAccessService';

export class SlackProvider implements OAuthProvider {
  name = 'slack';
  displayName = 'Slack';
  type = 'oauth2' as const;
  
  authorizationEndpoint = 'https://slack.com/oauth/v2/authorize';
  tokenEndpoint = 'https://slack.com/api/oauth.v2.access';
  revokeEndpoint = 'https://slack.com/api/auth.revoke';
  
  // Union of all scopes needed by all apps
  requiredScopes = FeatureAccessService.getAllRequiredScopesForProvider('slack');
  
  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(params: OAuthInitParams): Promise<string> {
    const config = await this.getConfig(params.organizationId);
    
    const authUrl = new URL(this.authorizationEndpoint);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('scope', this.requiredScopes.join(','));
    authUrl.searchParams.set('redirect_uri', params.redirectUri);
    authUrl.searchParams.set('state', params.state);
    
    return authUrl.toString();
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string, organizationId: string): Promise<TokenSet> {
    const config = await this.getConfig(organizationId);
    
    // Exchange code for tokens
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [SlackProvider] HTTP error during token exchange:`, {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500)
      });
      throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json() as any;
    
    // Log the full response for debugging
    console.log(`🔍 [SlackProvider] Slack token exchange response:`, {
      ok: data.ok,
      hasAccessToken: !!data.access_token,
      hasBot: !!data.bot,
      hasAuthedUser: !!data.authed_user,
      hasAuthedUserAccessToken: !!data.authed_user?.access_token,
      botAccessToken: !!data.bot?.bot_access_token,
      error: data.error,
      errorDescription: data.error_description,
      responseKeys: Object.keys(data)
    });
    
    if (!data.ok) {
      const errorMsg = data.error_description || data.error || 'Unknown error';
      console.error(`❌ [SlackProvider] Slack API returned error:`, {
        error: data.error,
        errorDescription: data.error_description,
        fullResponse: JSON.stringify(data).substring(0, 1000)
      });
      throw new Error(`Token exchange failed: ${errorMsg}`);
    }
    
    // Slack v2 can return tokens in different formats:
    // 1. data.access_token (bot token) + data.authed_user.access_token (user token)
    // 2. data.bot.bot_access_token (bot token) + data.authed_user.access_token (user token)
    // 3. Just data.access_token (if it's a user token)
    if (!data.access_token && !data.bot?.bot_access_token && !data.authed_user?.access_token) {
      console.error(`❌ [SlackProvider] No access token found in response:`, {
        hasAccessToken: !!data.access_token,
        hasBotToken: !!data.bot?.bot_access_token,
        hasUserToken: !!data.authed_user?.access_token,
        fullResponse: JSON.stringify(data).substring(0, 1000)
      });
      throw new Error('Token exchange succeeded but no access token received');
    }
    
    // Slack v2 returns tokens in different formats:
    // Prefer bot token (for workspace-level access), fallback to user token
    const botToken = data.bot?.bot_access_token || data.access_token;
    const userToken = data.authed_user?.access_token;
    
    // Use bot token if available, otherwise use user token
    const accessToken = botToken || userToken;
    
    if (!accessToken) {
      throw new Error('Token exchange succeeded but no access token received');
    }
    
    console.log(`✅ [SlackProvider] Token exchange successful:`, {
      hasBotToken: !!botToken,
      hasUserToken: !!userToken,
      usingToken: botToken ? 'bot' : 'user'
    });
    
    // Extract team/workspace info directly from token response
    // Slack OAuth v2 response includes team info
    const team = data.team || {};
    const accountInfo: AccountInfo = {
      email: data.authed_user?.id || '', // User ID
      name: team.name || '', // Team/workspace name
      id: team.id || '' // Team/workspace ID
    };
    
    // If team info is missing, try to get it from auth.test
    if (!accountInfo.id || !accountInfo.name) {
      try {
        const authTestInfo = await this.getAccountInfo(botToken);
        accountInfo.id = accountInfo.id || authTestInfo.id;
        accountInfo.name = accountInfo.name || authTestInfo.name;
        accountInfo.email = accountInfo.email || authTestInfo.email;
      } catch (error) {
        console.warn('⚠️ [SlackProvider] Failed to get account info from auth.test, using token response data');
      }
    }
    
    return {
      accessToken: accessToken, // Use bot token if available, otherwise user token
      refreshToken: undefined, // Slack tokens don't expire
      expiresAt: undefined, // Slack tokens are permanent
      scopes: data.scope?.split(',') || this.requiredScopes,
      accountInfo
    };
  }
  
  /**
   * Refresh expired access token
   * Note: Slack tokens don't expire, so this just validates the token
   */
  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    // Slack tokens don't expire, but validate it still works
    const accountInfo = await this.getAccountInfo(refreshToken);
    
    return {
      accessToken: refreshToken,
      refreshToken: undefined,
      expiresAt: undefined,
      scopes: this.requiredScopes,
      accountInfo
    };
  }
  
  /**
   * Revoke access token
   */
  async revokeAccess(accessToken: string, organizationId: string): Promise<void> {
    try {
      const response = await fetch(this.revokeEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        console.warn('⚠️ [SlackProvider] Slack API returned error during revocation');
      }
    } catch (error) {
      console.warn('⚠️ [SlackProvider] Failed to revoke token with Slack API:', error);
      // Continue anyway
    }
  }
  
  /**
   * Validate that connection still works
   */
  async validateConnection(tokens: TokenSet): Promise<boolean> {
    try {
      // Make a test API call to verify tokens work
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json() as any;
      return data.ok === true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get account information from Slack
   */
  private async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get account info');
      }
      
      const data = await response.json() as any;
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to get account info');
      }
      
      return {
        email: data.user || '',
        name: data.team || data.url || '',
        id: data.team_id || data.user_id || ''
      };
    } catch (error) {
      console.warn('⚠️ [SlackProvider] Failed to get account info, using defaults');
      return {
        email: '',
        name: '',
        id: ''
      };
    }
  }
  
  /**
   * Get provider configuration
   */
  async getConfig(organizationId: string): Promise<ProviderConfig> {
    console.log(`🔍 [SlackProvider] getConfig START - organizationId: "${organizationId}", type: ${typeof organizationId}, length: ${organizationId?.length}`);
    
    // Option 1: Get from Firestore (per-organization config)
    // Check integrationSettings first (current location)
    if (organizationId) {
      console.log(`🔍 [SlackProvider] organizationId is valid, checking Firestore...`);
      const settingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('slack')
        .get();
      
      console.log(`🔍 [SlackProvider] Firestore document exists: ${settingsDoc.exists}`);
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data()!;
        console.log(`🔍 [SlackProvider] Document data:`, {
          hasIsConfigured: !!data.isConfigured,
          isConfigured: data.isConfigured,
          hasAppId: !!data.appId,
          hasClientId: !!data.clientId,
          hasClientSecret: !!data.clientSecret,
          hasSigningSecret: !!data.signingSecret,
          clientIdLength: data.clientId?.length
        });
        
        if (data.isConfigured && data.clientId && data.clientSecret && data.signingSecret) {
          // Validate client secret - it should NOT be a URL or obviously wrong
          let clientSecret = data.clientSecret;
          if (clientSecret.startsWith('http://') || clientSecret.startsWith('https://')) {
            console.error(`❌ [SlackProvider] Client secret appears to be a URL, not a secret! Value: ${clientSecret.substring(0, 50)}...`);
            throw new Error('Invalid Client Secret: The value appears to be a URL. Please check your Slack app credentials and ensure you copied the Client Secret (not the Client ID or a URL).');
          }
          
          // Decrypt client secret if encrypted
          // Encrypted format: "iv:authTag:encrypted" (exactly 3 parts separated by ':')
          const clientSecretParts = clientSecret.split(':');
          if (clientSecretParts.length === 3) {
            // Looks like encrypted format - try to decrypt
            try {
              const { decryptToken } = await import('../encryption');
              clientSecret = decryptToken(clientSecret);
              console.log(`✅ [SlackProvider] Decrypted client secret`);
            } catch (error: any) {
              console.warn(`⚠️ [SlackProvider] Failed to decrypt client secret: ${error?.message}, using as-is`);
              // If decryption fails, use as-is (might be unencrypted)
            }
          } else {
            // Not in encrypted format, use as-is (unencrypted)
            console.log(`ℹ️ [SlackProvider] Client secret not encrypted (${clientSecretParts.length} parts), using as-is`);
          }
          
          // Decrypt signing secret if encrypted
          // Encrypted format: "iv:authTag:encrypted" (exactly 3 parts separated by ':')
          let signingSecret = data.signingSecret;
          const signingSecretParts = signingSecret.split(':');
          if (signingSecretParts.length === 3) {
            // Looks like encrypted format - try to decrypt
            try {
              const { decryptToken } = await import('../encryption');
              signingSecret = decryptToken(signingSecret);
              console.log(`✅ [SlackProvider] Decrypted signing secret`);
            } catch (error: any) {
              console.warn(`⚠️ [SlackProvider] Failed to decrypt signing secret: ${error?.message}, using as-is`);
              // If decryption fails, use as-is (might be unencrypted)
            }
          } else {
            // Not in encrypted format, use as-is (unencrypted)
            console.log(`ℹ️ [SlackProvider] Signing secret not encrypted (${signingSecretParts.length} parts), using as-is`);
          }
          
          console.log(`✅ [SlackProvider] Returning Slack config from integrationSettings/slack`);
          
          return {
            clientId: data.clientId.trim(),
            clientSecret: clientSecret.trim(),
            additionalParams: {
              appId: data.appId,
              signingSecret: signingSecret.trim(),
              redirectUri: data.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
              scope: data.scopes?.join(',') || 'chat:write,channels:read,groups:read,im:read,users:read,commands',
              userScope: data.userScopes?.join(',') || 'chat:write,channels:read,groups:read,im:read,users:read'
            }
          };
        } else {
          console.warn(`⚠️ [SlackProvider] Slack config incomplete:`, {
            hasIsConfigured: !!data.isConfigured,
            hasClientId: !!data.clientId,
            hasClientSecret: !!data.clientSecret,
            hasSigningSecret: !!data.signingSecret
          });
        }
      }
      
      // Also check integrationConfigs (alternative location)
      console.log(`🔍 [SlackProvider] Checking alternative location: integrationConfigs/slack-config`);
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('slack-config')
        .get();
      
      console.log(`🔍 [SlackProvider] Alternative config document exists: ${configDoc.exists}`);
      
      if (configDoc.exists) {
        const data = configDoc.data()!;
        console.log(`✅ [SlackProvider] Found config in integrationConfigs`);
        return {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          additionalParams: data.additionalParams
        };
      }
    }
    
    // Option 2: Get from environment variables (global config)
    console.log(`⚠️ [SlackProvider] No Firestore config found for organizationId: ${organizationId}, falling back to environment variables`);
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    
    console.log(`🔍 [SlackProvider] Environment variables:`, {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdLength: clientId?.length
    });
    
    if (!clientId || !clientSecret) {
      console.error(`❌ [SlackProvider] No credentials found in Firestore OR environment variables for org: ${organizationId}`);
      throw new Error('Slack OAuth credentials not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET environment variables or configure in Integration Settings.');
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

