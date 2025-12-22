/**
 * Apple Connect Configuration Management
 * 
 * Functions to save and retrieve Apple Connect OAuth configuration from Firestore
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import { db } from '../shared/utils';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { encryptionKey, getEncryptionKey } from './secrets';

/**
 * Encrypt sensitive data
 */
function encryptToken(text: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
function decryptToken(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const algorithm = 'aes-256-gcm';
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Get Apple Connect configuration from Firestore or environment
 */
export async function getAppleConnectConfig(organizationId: string) {
  console.log(`🔍 [AppleConnectConfig] Fetching config for org: ${organizationId}`);
  
  const configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('apple_connect')
    .get();
    
  if (!configDoc.exists) {
    // Fallback to environment variables
    let envClientId = process.env.APPLE_CONNECT_CLIENT_ID;
    let envTeamId = process.env.APPLE_CONNECT_TEAM_ID;
    let envKeyId = process.env.APPLE_CONNECT_KEY_ID;
    let envPrivateKey = process.env.APPLE_CONNECT_PRIVATE_KEY;
    let envRedirectUri = process.env.APPLE_CONNECT_REDIRECT_URI;
    let envLdapUrl = process.env.APPLE_CONNECT_LDAP_URL;
    let envLdapBindDn = process.env.APPLE_CONNECT_LDAP_BIND_DN;
    let envLdapBindPassword = process.env.APPLE_CONNECT_LDAP_BIND_PASSWORD;
    let envLdapBaseDn = process.env.APPLE_CONNECT_LDAP_BASE_DN;
    
    // Check functions.config() for Firebase Functions v1 compatibility
    if (!envClientId || !envTeamId || !envKeyId || !envPrivateKey) {
      try {
        const functionsConfig = functions.config();
        if (functionsConfig && functionsConfig.apple_connect) {
          envClientId = envClientId || functionsConfig.apple_connect.client_id;
          envTeamId = envTeamId || functionsConfig.apple_connect.team_id;
          envKeyId = envKeyId || functionsConfig.apple_connect.key_id;
          envPrivateKey = envPrivateKey || functionsConfig.apple_connect.private_key;
          envRedirectUri = envRedirectUri || functionsConfig.apple_connect.redirect_uri;
          envLdapUrl = envLdapUrl || functionsConfig.apple_connect.ldap_url;
          envLdapBindDn = envLdapBindDn || functionsConfig.apple_connect.ldap_bind_dn;
          envLdapBindPassword = envLdapBindPassword || functionsConfig.apple_connect.ldap_bind_password;
          envLdapBaseDn = envLdapBaseDn || functionsConfig.apple_connect.ldap_base_dn;
        }
      } catch (error: any) {
        console.log(`⚠️ [AppleConnectConfig] functions.config() not available:`, error?.message || error);
      }
    }
    
    envRedirectUri = envRedirectUri || 'https://backbone-logic.web.app/dashboard/integrations';
    
    if (envClientId && envTeamId && envKeyId && envPrivateKey) {
      console.log(`⚠️ [AppleConnectConfig] Using environment/functions.config variables (legacy mode) for org: ${organizationId}`);
      return {
        clientId: envClientId,
        teamId: envTeamId,
        keyId: envKeyId,
        privateKey: envPrivateKey,
        redirectUri: envRedirectUri,
        ldapUrl: envLdapUrl || '',
        ldapBindDn: envLdapBindDn || '',
        ldapBindPassword: envLdapBindPassword || '',
        ldapBaseDn: envLdapBaseDn || '',
      };
    }
    
    console.warn(`⚠️ [AppleConnectConfig] No config found for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Apple Connect integration not configured. Please configure in Integration Settings.'
    );
  }

  const config = configDoc.data()!;
  
  if (!config.isConfigured) {
    console.warn(`⚠️ [AppleConnectConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Apple Connect integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  console.log(`✅ [AppleConnectConfig] Config loaded for org: ${organizationId}`);
  
  return {
    clientId: config.clientId,
    teamId: config.teamId,
    keyId: config.keyId,
    privateKey: decryptToken(config.privateKey),
    redirectUri: config.redirectUri || 'https://backbone-logic.web.app/dashboard/integrations',
    ldapUrl: config.ldapUrl || '',
    ldapBindDn: config.ldapBindDn || '',
    ldapBindPassword: config.ldapBindPassword ? decryptToken(config.ldapBindPassword) : '',
    ldapBaseDn: config.ldapBaseDn || '',
  };
}

/**
 * Get Apple Connect configuration status (internal function)
 */
export async function getAppleConnectConfigStatusInternal(organizationId: string) {
  try {
    // Check integrationSettings/apple_connect first
    const configDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationSettings')
      .doc('apple_connect')
      .get();

    if (configDoc.exists) {
      const config = configDoc.data()!;
      return {
        isConfigured: config.isConfigured || false,
        clientId: config.clientId ? config.clientId.substring(0, 20) + '...' : null,
        configuredAt: config.configuredAt || null,
        configuredBy: config.configuredBy || null,
        source: 'firestore',
      };
    }

    // Check cloudIntegrations/apple_connect (OAuth tokens)
    const cloudIntegrationDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('apple_connect')
      .get();

    if (cloudIntegrationDoc.exists) {
      const cloudData = cloudIntegrationDoc.data()!;
      const isActive = cloudData.isActive !== false;
      const hasTokens = !!(cloudData.accessToken || cloudData.refreshToken);
      
      if (isActive && hasTokens) {
        return {
          isConfigured: true,
          clientId: null,
          configuredAt: cloudData.connectedAt || cloudData.updatedAt || null,
          configuredBy: null,
          source: 'cloudIntegrations',
          accountEmail: cloudData.accountEmail || null,
          accountName: cloudData.accountName || null,
        };
      }
    }

    // Check environment variables
    const hasEnvConfig = !!(process.env.APPLE_CONNECT_CLIENT_ID && process.env.APPLE_CONNECT_TEAM_ID && process.env.APPLE_CONNECT_KEY_ID && process.env.APPLE_CONNECT_PRIVATE_KEY);
    return {
      isConfigured: hasEnvConfig,
      clientId: hasEnvConfig ? process.env.APPLE_CONNECT_CLIENT_ID?.substring(0, 20) + '...' : null,
      configuredAt: null,
      configuredBy: null,
      source: hasEnvConfig ? 'environment' : 'none',
    };

  } catch (error) {
    console.error(`❌ [AppleConnectConfig] Error fetching config status:`, error);
    throw new HttpsError('internal', 'Failed to fetch Apple Connect configuration status');
  }
}

/**
 * Get Apple Connect configuration status (Firebase Function)
 */
export const getAppleConnectConfigStatus = onCall(
  { 
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId } = data;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

    return await getAppleConnectConfigStatusInternal(organizationId);
  }
);

