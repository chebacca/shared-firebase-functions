/**
 * Google Drive OAuth Provider
 * 
 * Implements OAuth 2.0 flow for Google Drive integration
 * Based on official Google OAuth 2.0 documentation
 */

import { OAuthProvider, OAuthInitParams, TokenSet, ProviderConfig, AccountInfo } from '../types';
import { google } from 'googleapis';
import { db } from '../../../shared/utils';
import { FeatureAccessService } from '../FeatureAccessService';

export class GoogleProvider implements OAuthProvider {
  name = 'google';
  displayName = 'Google Drive';
  type = 'oauth2' as const;

  authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  tokenEndpoint = 'https://oauth2.googleapis.com/token';
  revokeEndpoint = 'https://oauth2.googleapis.com/revoke';

  // Union of all scopes needed by all apps
  requiredScopes = FeatureAccessService.getAllRequiredScopesForProvider('google');

  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(params: OAuthInitParams): Promise<string> {
    let config: ProviderConfig;
    try {
      config = await this.getConfig(params.organizationId);
    } catch (error: any) {
      // Re-throw with clearer error message for missing credentials
      if (error.message?.includes('not configured') || error.message?.includes('client secret')) {
        throw new Error(`Google Drive is not configured. Please configure Google OAuth credentials in Integration Settings (organizations/${params.organizationId}/integrationSettings/google or organizations/${params.organizationId}/integrationConfigs/google-drive-integration).`);
      }
      throw error;
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error(`Google OAuth credentials are incomplete. Client ID and Client Secret must be configured in Integration Settings.`);
    }

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      params.redirectUri
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required for refresh token
      scope: this.requiredScopes,
      state: params.state,
      prompt: 'consent' // Force consent to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, redirectUri: string, organizationId: string): Promise<TokenSet> {
    const config = await this.getConfig(organizationId);

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens || !tokens.access_token) {
      throw new Error('Token exchange succeeded but no access_token received');
    }

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const userInfo = userInfoResponse.data as { email: string; name: string; id?: string; picture?: string };

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      scopes: tokens.scope?.split(' ') || this.requiredScopes,
      accountInfo: {
        email: userInfo.email || '',
        name: userInfo.name || '',
        id: userInfo.id || ''
      }
    };
  }

  /**
   * Refresh expired access token
   */
  async refreshTokens(refreshToken: string, organizationId: string): Promise<TokenSet> {
    const config = await this.getConfig(organizationId);

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.additionalParams?.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback'
    );

    // Set refresh token and refresh
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Token refresh failed - no access token received');
    }

    // Get updated user info
    oauth2Client.setCredentials(credentials);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const userInfo = userInfoResponse.data as { email: string; name: string; id?: string };

    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || refreshToken, // Keep existing if not provided
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
      scopes: credentials.scope?.split(' ') || this.requiredScopes,
      accountInfo: {
        email: userInfo.email || '',
        name: userInfo.name || '',
        id: userInfo.id || ''
      }
    };
  }

  /**
   * Revoke access token
   */
  async revokeAccess(accessToken: string, organizationId: string): Promise<void> {
    try {
      const revokeResponse = await fetch(`${this.revokeEndpoint}?token=${accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!revokeResponse.ok) {
        console.warn('⚠️ [GoogleProvider] Google API returned error during revocation');
      }
    } catch (error) {
      console.warn('⚠️ [GoogleProvider] Failed to revoke token with Google API:', error);
      // Continue anyway - we'll still mark as inactive
    }
  }

  /**
   * Validate that connection still works
   */
  async validateConnection(tokens: TokenSet): Promise<boolean> {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken
      });

      // Make a test API call to verify tokens work
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const response = await oauth2.userinfo.get();

      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get provider configuration
   */
  async getConfig(organizationId: string): Promise<ProviderConfig> {
    if (organizationId) {
      // Priority 1: Check integrationSettings/google (used by licensing website)
      const integrationSettingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .get();

      if (integrationSettingsDoc.exists) {
        const settingsData = integrationSettingsDoc.data()!;
        if (settingsData.isConfigured && settingsData.clientId && settingsData.clientSecret) {
          // Decrypt client secret if encrypted
          let clientSecret = settingsData.clientSecret;
          if (clientSecret.includes(':')) {
            try {
              const { decryptToken } = await import('../encryption');
              clientSecret = decryptToken(clientSecret);
            } catch (error) {
              console.warn('Failed to decrypt client secret, using as-is');
            }
          }

          console.log(`✅ [GoogleProvider] Loaded config from integrationSettings/google`);

          return {
            clientId: settingsData.clientId,
            clientSecret: clientSecret,
            additionalParams: {
              redirectUri: settingsData.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
              // 🔥 Always prefer code-defined required scopes to ensure feature availability
              scopes: this.requiredScopes.length > 0
                ? this.requiredScopes
                : (settingsData.scopes || [
                  'https://www.googleapis.com/auth/drive.readonly',
                  'https://www.googleapis.com/auth/drive.file',
                  'https://www.googleapis.com/auth/documents',
                  'https://www.googleapis.com/auth/userinfo.email',
                  'https://www.googleapis.com/auth/userinfo.profile',
                  'https://www.googleapis.com/auth/calendar',
                  'https://www.googleapis.com/auth/calendar.events',
                  'https://www.googleapis.com/auth/meetings.space.created',
                  'https://www.googleapis.com/auth/meetings.space.readonly'
                ])
            }
          };
        }
      }

      // Priority 2: Get from Firestore integrationConfigs (alternative location)
      // Check for google_docs or google_drive type configs
      const configsSnapshot = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .where('type', 'in', ['google_docs', 'google_drive'])
        .limit(1)
        .get();

      if (!configsSnapshot.empty) {
        const configDoc = configsSnapshot.docs[0];
        const data = configDoc.data()!;

        if (data.credentials?.clientId && data.credentials?.clientSecret) {
          console.log(`✅ [GoogleProvider] Loaded config from integrationConfigs/${configDoc.id}`);

          // Decrypt client secret if encrypted
          let clientSecret = data.credentials.clientSecret;
          if (clientSecret.includes(':')) {
            try {
              const { decryptToken } = await import('../encryption');
              clientSecret = decryptToken(clientSecret);
            } catch (error) {
              console.warn('Failed to decrypt client secret, using as-is');
            }
          }

          return {
            clientId: data.credentials.clientId,
            clientSecret: clientSecret,
            additionalParams: {
              redirectUri: data.settings?.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
              // 🔥 Always prefer code-defined required scopes
              scopes: this.requiredScopes.length > 0
                ? this.requiredScopes
                : [
                  'https://www.googleapis.com/auth/drive.readonly',
                  'https://www.googleapis.com/auth/drive.file',
                  'https://www.googleapis.com/auth/documents',
                  'https://www.googleapis.com/auth/userinfo.email',
                  'https://www.googleapis.com/auth/userinfo.profile',
                  'https://www.googleapis.com/auth/calendar',
                  'https://www.googleapis.com/auth/calendar.events',
                  'https://www.googleapis.com/auth/meetings.space.created',
                  'https://www.googleapis.com/auth/meetings.space.readonly'
                ]
            }
          };
        }
      }
    }

    // Option 2: Get from environment variables (global config)
    const clientId = process.env.GOOGLE_CLIENT_ID || '749245129278-vnepq570jrh5ji94c9olshc282bj1l86';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Option 3: Try Firebase Functions config (v1 compatibility)
    let finalClientId = clientId;
    let finalClientSecret = clientSecret;

    if (!finalClientSecret) {
      try {
        const functions = require('firebase-functions');
        const config = functions.config();
        if (config?.google) {
          finalClientId = finalClientId || config.google.client_id;
          finalClientSecret = finalClientSecret || config.google.client_secret;
        }
      } catch (error) {
        // Config not available (v2 functions)
      }
    }

    // Option 4: Try Application Default Credentials (ADC) for dev mode
    // This allows using gcloud auth application-default login in development
    if (!finalClientSecret) {
      try {
        // Check if we're in dev mode (not in Cloud Functions environment)
        const isDevMode = !process.env.FUNCTION_TARGET && !process.env.K_SERVICE;
        
        if (isDevMode) {
          // Try to use Google Auth Library with ADC
          const { GoogleAuth } = require('google-auth-library');
          const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
          });
          
          // ADC will be used automatically if GOOGLE_APPLICATION_CREDENTIALS is set
          // or if gcloud auth application-default login was run
          console.log('🔍 [GoogleProvider] Dev mode detected, attempting to use Application Default Credentials');
          
          // Note: ADC doesn't provide OAuth client credentials directly
          // It's used for service account authentication
          // For OAuth, we still need client ID/secret, but ADC can be used for other Google API calls
        }
      } catch (adcError) {
        // ADC not available or failed, continue with error below
        console.warn('⚠️ [GoogleProvider] Application Default Credentials not available:', adcError);
      }
    }

    if (!finalClientSecret) {
      throw new Error('Google OAuth client secret not configured. Set GOOGLE_CLIENT_SECRET environment variable or configure in Integration Settings.');
    }

    return {
      clientId: finalClientId,
      clientSecret: finalClientSecret,
      additionalParams: {
        redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
        // 🔥 Include requiredScopes for environment variable config path
        scopes: this.requiredScopes
      }
    };
  }
}

