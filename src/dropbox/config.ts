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
 * Get Dropbox configuration from Firestore
 */
export async function getDropboxConfig(organizationId: string) {
  console.log(`🔍 [DropboxConfig] Fetching config for org: ${organizationId}`);
  
  const configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('dropbox')
    .get();
    
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
  
  if (!config.isConfigured) {
    console.warn(`⚠️ [DropboxConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Dropbox integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  console.log(`✅ [DropboxConfig] Config loaded for org: ${organizationId}`);
  
  return {
    appKey: config.appKey,
    appSecret: decryptToken(config.appSecret),
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

      // Encrypt sensitive fields
      const encryptedAppSecret = encryptToken(appSecret);

      // Save configuration
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('dropbox')
        .set({
          appKey,
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

