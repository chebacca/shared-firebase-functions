/**
 * Box Configuration Management
 * 
 * Functions to save and retrieve Box OAuth configuration from Firestore
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
 * Get Box configuration from Firestore
 */
export async function getBoxConfig(organizationId: string) {
  console.log(`🔍 [BoxConfig] Fetching config for org: ${organizationId}`);
  
  const configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('box')
    .get();
    
  if (!configDoc.exists) {
    // Fallback to environment variables for backward compatibility
    const envClientId = process.env.BOX_CLIENT_ID;
    const envClientSecret = process.env.BOX_CLIENT_SECRET;
    const envRedirectUri = process.env.BOX_REDIRECT_URI || 'https://clipshowpro.web.app/auth/box/callback.html';
    const envScope = process.env.BOX_SCOPE || 'root_readwrite';
    
    if (envClientId && envClientSecret) {
      console.log(`⚠️ [BoxConfig] Using environment variables (legacy mode) for org: ${organizationId}`);
      return {
        clientId: envClientId,
        clientSecret: envClientSecret,
        redirectUri: envRedirectUri,
        scope: envScope,
      };
    }
    
    console.warn(`⚠️ [BoxConfig] No config found for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Box integration not configured. Please configure in Integration Settings.'
    );
  }

  const config = configDoc.data()!;
  
  if (!config.isConfigured) {
    console.warn(`⚠️ [BoxConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Box integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  // Validate required fields
  if (!config.clientId) {
    throw new HttpsError(
      'failed-precondition',
      'Box clientId is missing from configuration. Please reconfigure Box integration.'
    );
  }
  
  if (!config.clientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Box clientSecret is missing from configuration. Please reconfigure Box integration.'
    );
  }
  
  // Decrypt client secret if it looks encrypted (contains :)
  // This matches Google Drive's pattern for handling encrypted vs plaintext secrets
  let clientSecret = config.clientSecret;
  if (config.clientSecret && config.clientSecret.includes(':')) {
    try {
      clientSecret = decryptToken(config.clientSecret);
      console.log(`✅ [BoxConfig] Decrypted client secret for org: ${organizationId}`);
    } catch (error) {
      console.warn(`⚠️ [BoxConfig] Failed to decrypt client secret (falling back to plaintext):`, error);
      clientSecret = config.clientSecret;
    }
  } else {
    console.log(`ℹ️ [BoxConfig] Using plaintext client secret for org: ${organizationId}`);
  }
  
  // CRITICAL: Trim whitespace from credentials (common issue from copy/paste or form inputs)
  const trimmedClientId = config.clientId?.trim();
  const trimmedClientSecret = clientSecret?.trim();
  
  if (!trimmedClientId || !trimmedClientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Box credentials are invalid after trimming whitespace. Please reconfigure Box integration.'
    );
  }
  
  console.log(`✅ [BoxConfig] Config loaded for org: ${organizationId}`);
  
  return {
    clientId: trimmedClientId,
    clientSecret: trimmedClientSecret,
    redirectUri: config.redirectUri || 'https://clipshowpro.web.app/auth/box/callback.html',
    scope: config.scope || 'root_readwrite',
  };
}

/**
 * Save Box configuration to Firestore
 */
export const saveBoxConfig = onCall(
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

    const { organizationId, clientId, clientSecret, redirectUri, scope } = data;

    if (!organizationId || !clientId || !clientSecret) {
      throw new HttpsError('invalid-argument', 'Missing required configuration fields');
    }

    // CRITICAL: Trim whitespace from credentials before saving
    // This prevents issues with copy/paste or form inputs that add extra spaces
    const trimmedClientId = clientId.trim();
    const trimmedClientSecret = clientSecret.trim();

    if (!trimmedClientId || !trimmedClientSecret) {
      throw new HttpsError('invalid-argument', 'Client ID and Client Secret cannot be empty after trimming whitespace');
    }

    console.log(`💾 [BoxConfig] Saving config for org: ${organizationId} by user: ${auth.uid}`);

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
      const encryptedClientSecret = encryptToken(trimmedClientSecret);

      // Save configuration (using trimmed clientId)
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('box')
        .set({
          clientId: trimmedClientId,
          clientSecret: encryptedClientSecret,
          redirectUri: redirectUri || 'https://clipshowpro.web.app/auth/box/callback.html',
          scope: scope || 'root_readwrite',
          isConfigured: true,
          configuredBy: auth.uid,
          configuredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      console.log(`✅ [BoxConfig] Config saved successfully for org: ${organizationId}`);

      return {
        success: true,
        message: 'Box configuration saved successfully',
      };

    } catch (error) {
      console.error(`❌ [BoxConfig] Error saving config:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to save Box configuration');
    }
  }
);

/**
 * Get Box configuration status
 */
export const getBoxConfigStatus = onCall(
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
        .doc('box')
        .get();

      if (!configDoc.exists) {
        const hasEnvConfig = !!(process.env.BOX_CLIENT_ID && process.env.BOX_CLIENT_SECRET);
        return {
          isConfigured: hasEnvConfig,
          clientId: hasEnvConfig ? process.env.BOX_CLIENT_ID?.substring(0, 20) + '...' : null,
          configuredAt: null,
          configuredBy: null,
          source: hasEnvConfig ? 'environment' : 'none',
        };
      }

      const config = configDoc.data()!;

      return {
        isConfigured: config.isConfigured || false,
        clientId: config.clientId ? config.clientId.substring(0, 20) + '...' : null,
        configuredAt: config.configuredAt || null,
        configuredBy: config.configuredBy || null,
        source: 'firestore',
      };

    } catch (error) {
      console.error(`❌ [BoxConfig] Error fetching config status:`, error);
      throw new HttpsError('internal', 'Failed to fetch Box configuration status');
    }
  }
);

