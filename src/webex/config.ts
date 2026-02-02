/**
 * Webex Configuration Management
 * 
 * Functions to save and retrieve Webex OAuth configuration from Firestore
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
  // Ensure the key is exactly 32 bytes for AES-256-GCM
  // Use SHA-256 hash to derive a consistent 32-byte key from the secret
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
  // Ensure the key is exactly 32 bytes for AES-256-GCM
  // Use SHA-256 hash to derive a consistent 32-byte key from the secret
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Get Webex configuration from Firestore
 */
export async function getWebexConfig(organizationId: string) {
  console.log(`🔍 [WebexConfig] Fetching config for org: ${organizationId}`);
  
  const configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('webex')
    .get();
    
  if (!configDoc.exists) {
    // Fallback to environment variables for backward compatibility
    const envClientId = process.env.WEBEX_CLIENT_ID;
    const envClientSecret = process.env.WEBEX_CLIENT_SECRET;
    const envRedirectUri = process.env.WEBEX_REDIRECT_URI || 'https://backbone-logic.web.app/integration-settings';
    
    if (envClientId && envClientSecret) {
      console.log(`⚠️ [WebexConfig] Using environment variables (legacy mode) for org: ${organizationId}`);
      return {
        clientId: envClientId,
        clientSecret: envClientSecret,
        redirectUri: envRedirectUri,
        scopes: [
          'spark:all', // Webex meetings, messages, rooms
          'spark:meetings_write',
          'spark:meetings_read',
          'spark:people_read'
        ],
      };
    }
    
    console.warn(`⚠️ [WebexConfig] No config found for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Webex integration not configured. Please configure in Integration Settings.'
    );
  }

  const config = configDoc.data()!;
  
  if (!config.isConfigured) {
    console.warn(`⚠️ [WebexConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Webex integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  console.log(`✅ [WebexConfig] Config loaded for org: ${organizationId}`);
  
  return {
    clientId: config.clientId,
    clientSecret: decryptToken(config.clientSecret),
    redirectUri: config.redirectUri || 'https://backbone-logic.web.app/integration-settings',
    scopes: config.scopes || [
      'spark:all',
      'spark:meetings_write',
      'spark:meetings_read',
      'spark:people_read'
    ],
  };
}

/**
 * Save Webex configuration to Firestore
 */
export const saveWebexConfig = onCall(
  { 
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Increased from default 256MiB - function runs out of memory during initialization
    secrets: [encryptionKey],
  },
  async (request) => {
    const { auth, data } = request;

    // Verify authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, clientId, clientSecret, redirectUri } = data;

    if (!organizationId || !clientId || !clientSecret) {
      throw new HttpsError('invalid-argument', 'Missing required configuration fields');
    }

    console.log(`💾 [WebexConfig] Saving config for org: ${organizationId} by user: ${auth.uid}`);

    try {
      // Verify user is admin of the organization
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      // Check if user is admin
      if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
        throw new HttpsError('permission-denied', 'Only organization admins can configure integrations');
      }

      // Encrypt sensitive fields
      const encryptedClientSecret = encryptToken(clientSecret);

      // Save configuration
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('webex')
        .set({
          clientId,
          clientSecret: encryptedClientSecret,
          redirectUri: redirectUri || 'https://backbone-logic.web.app/integration-settings',
          scopes: [
            'spark:all',
            'spark:meetings_write',
            'spark:meetings_read',
            'spark:people_read'
          ],
          isConfigured: true,
          configuredBy: auth.uid,
          configuredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      console.log(`✅ [WebexConfig] Config saved successfully for org: ${organizationId}`);

      return {
        success: true,
        message: 'Webex configuration saved successfully',
      };

    } catch (error) {
      console.error(`❌ [WebexConfig] Error saving config:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to save Webex configuration');
    }
  }
);

/**
 * Get Webex configuration status
 */
export const getWebexConfigStatus = onCall(
  { 
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { auth, data } = request;

    // Verify authentication (even though invoker is public, we still require auth for the actual request)
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
        .doc('webex')
        .get();

      if (!configDoc.exists) {
        // Check environment variables as fallback
        const hasEnvConfig = !!(process.env.WEBEX_CLIENT_ID && process.env.WEBEX_CLIENT_SECRET);
        return {
          isConfigured: hasEnvConfig,
          clientId: hasEnvConfig ? process.env.WEBEX_CLIENT_ID?.substring(0, 20) + '...' : null,
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
      console.error(`❌ [WebexConfig] Error fetching config status:`, error);
      throw new HttpsError('internal', 'Failed to fetch Webex configuration status');
    }
  }
);

