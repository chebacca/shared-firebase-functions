/**
 * Dropbox OAuth Provider
 * 
 * Implements OAuth 2.0 flow for Dropbox integration
 * Based on official Dropbox OAuth 2.0 documentation
 */

import { OAuthProvider, OAuthInitParams, TokenSet, ProviderConfig, AccountInfo } from '../types';
import { db } from '../../../shared/utils';
import { FeatureAccessService } from '../FeatureAccessService';

export class DropboxProvider implements OAuthProvider {
  name = 'dropbox';
  displayName = 'Dropbox';
  type = 'oauth2' as const;

  authorizationEndpoint = 'https://www.dropbox.com/oauth2/authorize';
  tokenEndpoint = 'https://api.dropbox.com/oauth2/token';
  revokeEndpoint = 'https://api.dropbox.com/2/auth/token/revoke';

  // Union of all scopes needed by all apps
  requiredScopes = FeatureAccessService.getAllRequiredScopesForProvider('dropbox');

  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(params: OAuthInitParams): Promise<string> {
    const config = await this.getConfig(params.organizationId);

    const authUrl = new URL(this.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', params.redirectUri);
    authUrl.searchParams.set('scope', this.requiredScopes.join(' '));
    authUrl.searchParams.set('state', params.state);
    authUrl.searchParams.set('token_access_type', 'offline'); // For refresh token

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
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.access_token) {
      throw new Error('Token exchange succeeded but no access_token received');
    }

    // Get user account info
    const accountInfo = await this.getAccountInfo(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: data.scope?.split(' ') || this.requiredScopes,
      accountInfo
    };
  }

  /**
   * Refresh expired access token
   */
  async refreshTokens(refreshToken: string, organizationId: string): Promise<TokenSet> {
    const config = await this.getConfig(organizationId);

    // Refresh tokens
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as any;

    if (!data.access_token) {
      throw new Error('Token refresh failed - no access token received');
    }

    // Get updated account info
    const accountInfo = await this.getAccountInfo(data.access_token);

    return {
      accessToken: (data as any).access_token,
      refreshToken: (data as any).refresh_token || refreshToken,
      expiresAt: (data as any).expires_in ? new Date(Date.now() + (data as any).expires_in * 1000) : undefined,
      scopes: (data as any).scope?.split(' ') || this.requiredScopes,
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
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        console.warn('⚠️ [DropboxProvider] Dropbox API returned error during revocation');
      }
    } catch (error) {
      console.warn('⚠️ [DropboxProvider] Failed to revoke token with Dropbox API:', error);
      // Continue anyway
    }
  }

  /**
   * Validate that connection still works
   */
  async validateConnection(tokens: TokenSet): Promise<boolean> {
    try {
      // Make a test API call to verify tokens work
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get account information from Dropbox
   */
  private async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    try {
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get account info');
      }

      const data = await response.json();

      return {
        email: (data as any).email || '',
        name: (data as any).name?.display_name || (data as any).name?.given_name || '',
        id: (data as any).account_id || ''
      };
    } catch (error) {
      console.warn('⚠️ [DropboxProvider] Failed to get account info, using defaults');
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
    // Option 1: Get from Firestore (per-organization config)
    // Check integrationSettings first (current location)
    if (organizationId) {
      const settingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('dropbox')
        .get();

      if (settingsDoc.exists) {
        const data = settingsDoc.data()!;
        if (data.isConfigured && (data.appKey || data.clientId) && (data.appSecret || data.clientSecret)) {
          // Decrypt client secret if encrypted
          let clientSecret = data.appSecret || data.clientSecret;
          if (clientSecret && clientSecret.includes(':')) {
            try {
              const { decryptToken } = await import('../encryption');
              clientSecret = decryptToken(clientSecret);
            } catch (error) {
              console.warn('Failed to decrypt client secret, using as-is');
            }
          }

          return {
            clientId: (data.appKey || data.clientId).trim(),
            clientSecret: (clientSecret || '').trim(),
            additionalParams: {
              redirectUri: data.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback'
            }
          };
        }
      }

      // Also check integrationConfigs (alternative location)
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('dropbox-config')
        .get();

      if (configDoc.exists) {
        const data = configDoc.data()!;
        return {
          clientId: data.appKey || data.clientId,
          clientSecret: data.appSecret || data.clientSecret,
          additionalParams: data.additionalParams
        };
      }
    }

    // Option 2: Get from environment variables (global config)
    const clientId = process.env.DROPBOX_APP_KEY || process.env.DROPBOX_CLIENT_ID;
    const clientSecret = process.env.DROPBOX_APP_SECRET || process.env.DROPBOX_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Dropbox OAuth credentials not configured. Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET environment variables or configure in Integration Settings.');
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

