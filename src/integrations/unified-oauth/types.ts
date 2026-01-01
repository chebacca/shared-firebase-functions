/**
 * Unified OAuth Types
 * 
 * Type definitions for the extensible OAuth provider system
 */

/**
 * Integration Type - supports multiple auth methods
 */
export type IntegrationType = 'oauth2' | 'api_key' | 'webhook' | 'basic_auth';

/**
 * OAuth Provider Plugin Interface
 * Implement this interface to add a new OAuth provider
 */
export interface OAuthProvider {
  // Provider metadata
  name: string; // 'google', 'box', 'dropbox', 'slack', 'airtable', 'notion', etc.
  displayName: string; // 'Google Drive', 'Box', 'Dropbox', etc.
  type: IntegrationType; // 'oauth2', 'api_key', etc.
  
  // OAuth 2.0 endpoints (if type === 'oauth2')
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  revokeEndpoint?: string;
  
  // Required scopes (union of all app requirements)
  requiredScopes: string[];
  
  // OAuth flow methods
  getAuthUrl(params: OAuthInitParams): Promise<string>;
  exchangeCodeForTokens(code: string, redirectUri: string, organizationId: string): Promise<TokenSet>;
  refreshTokens(refreshToken: string, organizationId: string): Promise<TokenSet>;
  revokeAccess(accessToken: string, organizationId: string): Promise<void>;
  validateConnection(tokens: TokenSet): Promise<boolean>;
  
  // Optional: Custom configuration
  getConfig?(organizationId: string): Promise<ProviderConfig>;
  
  // Optional: Webhook setup
  setupWebhook?(organizationId: string, webhookUrl: string): Promise<void>;
}

/**
 * API Key Provider Plugin Interface
 * For providers like Airtable that use API keys instead of OAuth
 */
export interface ApiKeyProvider {
  name: string;
  displayName: string;
  type: 'api_key';
  
  validateApiKey(apiKey: string): Promise<boolean>;
  getAccountInfo(apiKey: string): Promise<AccountInfo>;
  revokeApiKey?(apiKey: string): Promise<void>;
}

/**
 * Provider Plugin - Union type for all provider types
 */
export type ProviderPlugin = OAuthProvider | ApiKeyProvider;

/**
 * Token Set returned from OAuth flow
 */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  accountInfo: AccountInfo;
}

/**
 * OAuth Initiation Parameters
 */
export interface OAuthInitParams {
  organizationId: string;
  userId: string;
  redirectUri: string;
  state: string;
}

/**
 * Provider Configuration
 */
export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  additionalParams?: Record<string, any>;
}

/**
 * Account Information
 */
export interface AccountInfo {
  email: string;
  name: string;
  id: string;
}

/**
 * Connection Status
 */
export interface ConnectionStatus {
  connected: boolean;
  provider: string;
  accountEmail?: string;
  accountName?: string;
  connectedAt?: any;
  expiresAt?: any;
}

