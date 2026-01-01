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
    const config = await this.getConfig(params.organizationId);
    
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
      refreshToken: tokens.refresh_token,
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
    // Option 1: Get from Firestore (per-organization config)
    // Check integrationSettings first (current location)
    if (organizationId) {
      const settingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .get();
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data()!;
        if (data.isConfigured && data.clientId && data.clientSecret) {
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
          
          return {
            clientId: data.clientId,
            clientSecret: clientSecret,
            additionalParams: {
              redirectUri: data.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback',
              scopes: data.scopes
            }
          };
        }
      }
      
      // Also check integrationConfigs (alternative location)
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('google-config')
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
    
    if (!finalClientSecret) {
      throw new Error('Google OAuth client secret not configured. Set GOOGLE_CLIENT_SECRET environment variable or configure in Integration Settings.');
    }
    
    return {
      clientId: finalClientId,
      clientSecret: finalClientSecret,
      additionalParams: {
        redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback'
      }
    };
  }
}

