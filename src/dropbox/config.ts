/**
 * Dropbox Configuration Management
 * 
 * Functions to save and retrieve Dropbox OAuth configuration from Firestore
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Cannot decrypt: encryptedData is missing or invalid');
  }
  
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Cannot decrypt: encryptedData format is invalid (expected format: iv:authTag:encrypted)');
  }
  
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
 * Get Dropbox configuration from Firestore
 */
export async function getDropboxConfig(organizationId: string) {
  console.log(`🔍 [DropboxConfig] Fetching config for org: ${organizationId}`);
  
  // Try new location first (integrationSettings/dropbox)
  let configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('dropbox')
    .get();
  
  // Fallback to integrationConfigs/dropbox-integration (unified system)
  if (!configDoc.exists) {
    console.log(`🔍 [DropboxConfig] Not found in integrationSettings, checking integrationConfigs...`);
    configDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationConfigs')
      .doc('dropbox-integration')
      .get();
  }
    
  if (!configDoc.exists) {
    // Fallback to environment variables for backward compatibility
    const envAppKey = process.env.DROPBOX_APP_KEY;
    const envAppSecret = process.env.DROPBOX_APP_SECRET;
    const envRedirectUri = process.env.DROPBOX_REDIRECT_URI || 'https://clipshowpro.web.app/integration-settings';
    
    if (envAppKey && envAppSecret) {
      console.log(`⚠️ [DropboxConfig] Using environment variables (legacy mode) for org: ${organizationId}`);
      return {
        appKey: envAppKey,
        appSecret: envAppSecret,
        redirectUri: envRedirectUri,
      };
    }
    
    console.warn(`⚠️ [DropboxConfig] No config found for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Dropbox integration not configured. Please configure in Integration Settings.'
    );
  }

  const config = configDoc.data()!;
  
  // For integrationConfigs, credentials are stored in a nested object
  const credentials = config.credentials || config;
  const appKey = credentials.clientId || credentials.appKey;
  const appSecret = credentials.clientSecret || credentials.appSecret;
  
  // Check if configured (for integrationSettings) or enabled (for integrationConfigs)
  const isConfigured = config.isConfigured !== false && config.enabled !== false;
  
  if (!isConfigured) {
    console.warn(`⚠️ [DropboxConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Dropbox integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  // Validate required fields
  if (!appKey) {
    throw new HttpsError(
      'failed-precondition',
      'Dropbox appKey/clientId is missing from configuration. Please reconfigure Dropbox integration.'
    );
  }
  
  if (!appSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Dropbox appSecret/clientSecret is missing from configuration. Please reconfigure Dropbox integration.'
    );
  }
  
  // Decrypt app secret if it looks encrypted (contains :)
  // This matches Google Drive's pattern for handling encrypted vs plaintext secrets
  let decryptedAppSecret = appSecret;
  if (appSecret && appSecret.includes(':')) {
    try {
      decryptedAppSecret = decryptToken(appSecret);
      console.log(`✅ [DropboxConfig] Decrypted app secret for org: ${organizationId}`);
    } catch (error) {
      console.warn(`⚠️ [DropboxConfig] Failed to decrypt app secret (falling back to plaintext):`, error);
      decryptedAppSecret = appSecret;
    }
  } else {
    console.log(`ℹ️ [DropboxConfig] Using plaintext app secret for org: ${organizationId}`);
  }
  
  // CRITICAL: Trim whitespace from credentials (common issue from copy/paste or form inputs)
  const trimmedAppKey = appKey?.trim();
  const trimmedAppSecret = decryptedAppSecret?.trim();
  
  if (!trimmedAppKey || !trimmedAppSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Dropbox credentials are invalid after trimming whitespace. Please reconfigure Dropbox integration.'
    );
  }
  
  console.log(`✅ [DropboxConfig] Config loaded for org: ${organizationId}`);
  
  return {
    appKey: trimmedAppKey,
    appSecret: trimmedAppSecret,
    redirectUri: config.redirectUri || 'https://clipshowpro.web.app/integration-settings',
  };
}

/**
 * Save Dropbox configuration to Firestore
 */
export const saveDropboxConfig = onCall(
  { 
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Increased from default 256MiB - function runs out of memory during initialization
    secrets: [encryptionKey],
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, appKey, appSecret, redirectUri } = data;

    if (!organizationId || !appKey || !appSecret) {
      throw new HttpsError('invalid-argument', 'Missing required configuration fields');
    }

    // CRITICAL: Trim whitespace from credentials before saving
    // This prevents issues with copy/paste or form inputs that add extra spaces
    const trimmedAppKey = appKey.trim();
    const trimmedAppSecret = appSecret.trim();

    if (!trimmedAppKey || !trimmedAppSecret) {
      throw new HttpsError('invalid-argument', 'App Key and App Secret cannot be empty after trimming whitespace');
    }

    console.log(`💾 [DropboxConfig] Saving config for org: ${organizationId} by user: ${auth.uid}`);

    try {
      // Verify user is admin
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
        throw new HttpsError('permission-denied', 'Only organization admins can configure integrations');
      }

      // Encrypt sensitive fields (using trimmed values)
      const encryptedAppSecret = encryptToken(trimmedAppSecret);

      // Save configuration (using trimmed appKey)
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('dropbox')
        .set({
          appKey: trimmedAppKey,
          appSecret: encryptedAppSecret,
          redirectUri: redirectUri || 'https://clipshowpro.web.app/integration-settings',
          isConfigured: true,
          configuredBy: auth.uid,
          configuredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      console.log(`✅ [DropboxConfig] Config saved successfully for org: ${organizationId}`);

      return {
        success: true,
        message: 'Dropbox configuration saved successfully',
      };

    } catch (error) {
      console.error(`❌ [DropboxConfig] Error saving config:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to save Dropbox configuration');
    }
  }
);

/**
 * Get Dropbox configuration status
 */
export const getDropboxConfigStatus = onCall(
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

    try {
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('dropbox')
        .get();

      if (!configDoc.exists) {
        const hasEnvConfig = !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET);
        return {
          isConfigured: hasEnvConfig,
          appKey: hasEnvConfig ? process.env.DROPBOX_APP_KEY?.substring(0, 20) + '...' : null,
          configuredAt: null,
          configuredBy: null,
          source: hasEnvConfig ? 'environment' : 'none',
        };
      }

      const config = configDoc.data()!;

      return {
        isConfigured: config.isConfigured || false,
        appKey: config.appKey ? config.appKey.substring(0, 20) + '...' : null,
        configuredAt: config.configuredAt || null,
        configuredBy: config.configuredBy || null,
        source: 'firestore',
      };

    } catch (error) {
      console.error(`❌ [DropboxConfig] Error fetching config status:`, error);
      throw new HttpsError('internal', 'Failed to fetch Dropbox configuration status');
    }
  }
);

