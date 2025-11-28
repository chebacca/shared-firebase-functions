/**
 * Slack Configuration Management
 * 
 * Functions to save and retrieve Slack app configuration from Firestore
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
 * Get Slack configuration from Firestore
 */
export async function getSlackConfig(organizationId: string) {
  console.log(`🔍 [SlackConfig] Fetching config for org: ${organizationId}`);
  
  const configDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('slack')
    .get();
    
  if (!configDoc.exists) {
    console.warn(`⚠️ [SlackConfig] No config found for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Slack integration not configured. Please configure in Integration Settings.'
    );
  }

  const config = configDoc.data()!;
  
  if (!config.isConfigured) {
    console.warn(`⚠️ [SlackConfig] Config exists but not marked as configured for org: ${organizationId}`);
    throw new HttpsError(
      'failed-precondition', 
      'Slack integration not fully configured. Please complete setup in Integration Settings.'
    );
  }
  
  console.log(`✅ [SlackConfig] Config loaded for org: ${organizationId}`);
  
  return {
    appId: config.appId,
    clientId: config.clientId,
    clientSecret: decryptToken(config.clientSecret),
    signingSecret: decryptToken(config.signingSecret),
    redirectUri: config.redirectUri || 'https://us-central1-backbone-logic.cloudfunctions.net/slackOAuthCallback',
    scopes: config.scopes || [
      'channels:read',
      'channels:history',
      'chat:write',
      'reactions:write',
      'files:write',
      'users:read',
      'groups:read',
      'groups:history',
      'im:history',
      'im:read'
    ],
  };
}

/**
 * Save Slack configuration to Firestore
 */
export const saveSlackConfig = onCall(
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

    const { organizationId, appId, clientId, clientSecret, signingSecret } = data;

    if (!organizationId || !appId || !clientId || !clientSecret || !signingSecret) {
      throw new HttpsError('invalid-argument', 'Missing required configuration fields');
    }

    console.log(`💾 [SlackConfig] Saving config for org: ${organizationId} by user: ${auth.uid}`);

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
      const encryptedSigningSecret = encryptToken(signingSecret);

      // Save configuration
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('slack')
        .set({
          appId,
          clientId,
          clientSecret: encryptedClientSecret,
          signingSecret: encryptedSigningSecret,
          redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/slackOAuthCallback',
          scopes: [
            'channels:read',
            'channels:history',
            'chat:write',
            'reactions:write',
            'files:write',
            'users:read',
            'groups:read',
            'groups:history',
            'im:history',
            'im:read'
          ],
          isConfigured: true,
          configuredBy: auth.uid,
        });

      console.log(`✅ [SlackConfig] Config saved successfully for org: ${organizationId}`);

      return {
        success: true,
        message: 'Slack configuration saved successfully',
      };

    } catch (error) {
      console.error(`❌ [SlackConfig] Error saving config:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to save Slack configuration');
    }
  }
);

/**
 * Disconnect all Slack workspaces for an organization
 * This does NOT remove the Slack app credentials - they remain for future use
 */
export const disconnectSlackWorkspaces = onCall(
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

    const { organizationId } = data;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

      console.log(`🔌 [SlackConfig] Disconnecting workspaces for org: ${organizationId} by user: ${auth.uid}`);

    try {
      // Verify user is admin of the organization
      const userDoc = await db.collection('users').doc(auth.uid).get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }
      
      const userData = userDoc.data();

      if (!userData || userData.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      // Check if user is admin
      if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
        throw new HttpsError('permission-denied', 'Only organization admins can disconnect integrations');
      }

      // Check if organization exists
      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      if (!orgDoc.exists) {
        throw new HttpsError('not-found', 'Organization not found');
      }

      // Get all Slack connections for this organization
      const connectionsSnapshot = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('slackConnections')
        .where('isActive', '==', true)
        .get();

      console.log(`📊 [SlackConfig] Found ${connectionsSnapshot.size} active connections to disconnect`);

      // Check if config exists before starting batch operations
      const configRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('slack');

      const configDoc = await configRef.get();

      // Disconnect all connections (but keep credentials)
      const batch = db.batch();
      let hasUpdates = false;
      
      // Use FieldValue.serverTimestamp() for proper serialization
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      
      connectionsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { 
          isActive: false,
          disconnectedAt: timestamp,
          disconnectedBy: auth.uid
        });
        hasUpdates = true;
      });

      // Update config to track disconnection (but keep isConfigured = true)
      // Only update if config exists
      if (configDoc.exists) {
        batch.update(configRef, {
          lastDisconnectedAt: timestamp,
          lastDisconnectedBy: auth.uid,
          updatedAt: timestamp
        });
        hasUpdates = true;
      }

      // Commit all changes only if there are updates
      if (hasUpdates) {
        try {
          await batch.commit();
          console.log(`✅ [SlackConfig] Batch commit successful`);
        } catch (batchError: any) {
          console.error(`❌ [SlackConfig] Batch commit failed:`, batchError);
          throw new HttpsError('internal', `Failed to commit disconnection: ${batchError.message}`);
        }
      } else {
        console.log(`ℹ️ [SlackConfig] No active connections or config to update`);
      }

      console.log(`✅ [SlackConfig] Disconnected ${connectionsSnapshot.size} workspaces for org: ${organizationId} (credentials preserved)`);

      return {
        success: true,
        message: connectionsSnapshot.size > 0 
          ? 'All Slack workspaces disconnected successfully. Credentials remain configured for future use.'
          : 'No active Slack workspaces found to disconnect.',
        disconnectedWorkspaces: connectionsSnapshot.size
      };

    } catch (error) {
      console.error(`❌ [SlackConfig] Error disconnecting workspaces:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to disconnect Slack workspaces');
    }
  }
);

export const getSlackConfigStatus = onCall(
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
        .doc('slack')
        .get();

      if (!configDoc.exists) {
        return {
          isConfigured: false,
          appId: null,
          clientId: null,
          configuredAt: null,
          configuredBy: null,
        };
      }

      const config = configDoc.data()!;

      return {
        isConfigured: config.isConfigured || false,
        appId: config.appId || null,
        clientId: config.clientId || null,
        configuredAt: config.configuredAt || null,
        configuredBy: config.configuredBy || null,
      };

    } catch (error) {
      console.error(`❌ [SlackConfig] Error fetching config status:`, error);
      throw new HttpsError('internal', 'Failed to fetch Slack configuration status');
    }
  }
);

