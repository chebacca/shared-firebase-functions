/**
 * Google Drive Configuration Management
 * 
 * Functions to save and retrieve Google Drive OAuth configuration from Firestore
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions'; // Import v1 for config() access
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
 * Get Google Drive configuration from Firestore
 */
export async function getGoogleConfig(organizationId: string) {
  console.log(`🔍 [GoogleConfig] Fetching config for org: ${organizationId}`);
  
  const configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('google')
    .get();
    
  if (!configDoc.exists) {
    // Fallback to environment variables for backward compatibility
    let envClientId = process.env.GOOGLE_CLIENT_ID;
    let envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    let envRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    // 🔥 CRITICAL FIX: Also check functions.config() for Firebase Functions v1 compatibility
    // This is where the credentials are actually stored in the current deployment
    if (!envClientId || !envClientSecret) {
      try {
        // Access v1 functions.config() - imported at top level
        const functionsConfig = functions.config();
        if (functionsConfig && functionsConfig.google) {
          envClientId = envClientId || functionsConfig.google.client_id;
          envClientSecret = envClientSecret || functionsConfig.google.client_secret;
          envRedirectUri = envRedirectUri || functionsConfig.google.redirect_uri;
          console.log(`🔍 [GoogleConfig] Found credentials in functions.config().google`);
        }
      } catch (error: any) {
        console.log(`⚠️ [GoogleConfig] functions.config() not available:`, error?.message || error);
      }
    }
    
    // NOTE: redirectUri should come from the client request, not env/config
    // This is a fallback only - the actual redirect URI is provided by the client
    envRedirectUri = envRedirectUri || 'https://backbone-logic.web.app/integration-settings';
    
    if (envClientId && envClientSecret) {
      console.log(`⚠️ [GoogleConfig] Using environment/functions.config variables (legacy mode) for org: ${organizationId}`);
      return {
        clientId: envClientId,
        clientSecret: envClientSecret,
        redirectUri: envRedirectUri,
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          // Google Calendar and Meet scopes
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/meetings.space.created',
          'https://www.googleapis.com/auth/meetings.space.readonly'
        ],
      };
    }
    
    console.warn(`⚠️ [GoogleConfig] No config found for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Google Drive integration not configured. Please configure in Integration Settings.'
    );
  }

  const config = configDoc.data()!;
  
  if (!config.isConfigured) {
    console.warn(`⚠️ [GoogleConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Google Drive integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  console.log(`✅ [GoogleConfig] Config loaded for org: ${organizationId}`);
  
  return {
    clientId: config.clientId,
    clientSecret: decryptToken(config.clientSecret),
    redirectUri: config.redirectUri || 'https://backbone-client.web.app/integration-settings',
    scopes: config.scopes || [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      // Google Calendar and Meet scopes
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/meetings.space.created',
      'https://www.googleapis.com/auth/meetings.space.readonly'
    ],
  };
}

/**
 * Save Google Drive configuration to Firestore
 */
export const saveGoogleConfig = onCall(
  { 
    region: 'us-central1',
    cors: true,
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

    console.log(`💾 [GoogleConfig] Saving config for org: ${organizationId} by user: ${auth.uid}`);

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
        .doc('google')
        .set({
          clientId,
          clientSecret: encryptedClientSecret,
          redirectUri: redirectUri || 'https://backbone-client.web.app/integration-settings',
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            // Google Calendar and Meet scopes
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/meetings.space.created',
            'https://www.googleapis.com/auth/meetings.space.readonly'
          ],
          isConfigured: true,
          configuredBy: auth.uid,
          configuredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      console.log(`✅ [GoogleConfig] Config saved successfully for org: ${organizationId}`);

      return {
        success: true,
        message: 'Google Drive configuration saved successfully',
      };

    } catch (error) {
      console.error(`❌ [GoogleConfig] Error saving config:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to save Google Drive configuration');
    }
  }
);

/**
 * Get Google Drive configuration status
 */
export const getGoogleConfigStatus = onCall(
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
      // Check integrationSettings/google first (explicit configuration)
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
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

      // Fallback 1: Check cloudIntegrations/google (OAuth tokens from OAuth flow)
      const cloudIntegrationDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('google')
        .get();

      if (cloudIntegrationDoc.exists) {
        const cloudData = cloudIntegrationDoc.data()!;
        // Check if connection is active (isActive !== false)
        const isActive = cloudData.isActive !== false;
        const hasTokens = !!(cloudData.tokens || cloudData.encryptedTokens || cloudData.accessToken || cloudData.refreshToken);
        
        if (isActive && hasTokens) {
          console.log(`✅ [GoogleConfig] Found active connection in cloudIntegrations/google for org: ${organizationId}`);
          return {
            isConfigured: true,
            clientId: null, // OAuth tokens don't include client ID
            configuredAt: cloudData.createdAt || cloudData.updatedAt || null,
            configuredBy: null, // OAuth flow doesn't track configuredBy
            source: 'cloudIntegrations',
            accountEmail: cloudData.accountEmail || null,
            accountName: cloudData.accountName || null,
          };
        } else {
          console.log(`⚠️ [GoogleConfig] cloudIntegrations/google exists but not active or missing tokens for org: ${organizationId}`);
        }
      }

      // Fallback 2: Check environment variables
      const hasEnvConfig = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      return {
        isConfigured: hasEnvConfig,
        clientId: hasEnvConfig ? process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...' : null,
        configuredAt: null,
        configuredBy: null,
        source: hasEnvConfig ? 'environment' : 'none',
      };

    } catch (error) {
      console.error(`❌ [GoogleConfig] Error fetching config status:`, error);
      throw new HttpsError('internal', 'Failed to fetch Google Drive configuration status');
    }
  }
);

