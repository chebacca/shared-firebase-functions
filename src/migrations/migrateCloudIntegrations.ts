/**
 * Migration Script: cloudIntegrations → {provider}Connections
 * 
 * Migrates existing Box and Dropbox connections from the old cloudIntegrations
 * collection to the new {provider}Connections collections following the Slack pattern.
 * 
 * Usage:
 *   - Deploy as a Firebase Function
 *   - Call via HTTP or callable function
 *   - Can be run per-organization or for all organizations
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

/**
 * Encrypt token in Google OAuth format (iv:authTag:encrypted)
 * Matches the format used by google/oauth.ts
 */
function encryptTokenForGoogle(text: string): string {
  const algorithm = 'aes-256-gcm';
  
  // Get encryption key (same as Google OAuth)
  const encryptionKeyValue = process.env.ENCRYPTION_KEY || process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!encryptionKeyValue || typeof encryptionKeyValue !== 'string' || encryptionKeyValue.length < 32) {
    throw new Error('Encryption key not available or invalid');
  }

  const key = crypto.createHash('sha256').update(encryptionKeyValue, 'utf8').digest();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Migrate Box connections from cloudIntegrations to boxConnections
 */
export async function migrateBoxConnections(organizationId: string): Promise<{
  migrated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migrated = 0;

  try {
    // Check old locations
    const oldLocations = [
      { collection: 'cloudIntegrations', docId: 'box' },
      { collection: 'cloudIntegrations', docId: 'box_org' },
    ];

    // Also check for per-user connections (box_{userId})
    const usersSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('users')
      .get();

    for (const userDoc of usersSnapshot.docs) {
      oldLocations.push({
        collection: 'cloudIntegrations',
        docId: `box_${userDoc.id}`,
      });
    }

    // Try each old location
    for (const location of oldLocations) {
      const oldDocRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection(location.collection)
        .doc(location.docId);

      const oldDoc = await oldDocRef.get();

      if (!oldDoc.exists) {
        continue; // Skip if doesn't exist
      }

      const oldData = oldDoc.data()!;

      // Check if already migrated (connection exists in new location)
      const existingConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('boxConnections')
        .where('accountEmail', '==', oldData.accountEmail || '')
        .limit(1)
        .get();

      if (!existingConnections.empty) {
        console.log(`⏭️ [Migration] Box connection for ${oldData.accountEmail} already exists, skipping`);
        continue;
      }

      // Extract connection data
      const connectionData: any = {
        organizationId,
        type: location.docId.includes('_') && !location.docId.includes('_org') ? 'user' : 'organization',
        userId: oldData.userId || null,
        accountEmail: oldData.accountEmail || '',
        accountName: oldData.accountName || '',
        accountId: oldData.accountId || null,
        accessToken: oldData.encryptedTokens || oldData.accessToken || '',
        refreshToken: oldData.refreshToken || null,
        tokenExpiresAt: oldData.expiresAt || oldData.tokenExpiresAt || null,
        scopes: oldData.scopes || ['root_readwrite'],
        connectedBy: oldData.connectedBy || oldData.userId || 'system',
        isActive: oldData.isActive !== false, // Default to true
        connectedAt: oldData.createdAt || oldData.connectedAt || Timestamp.now(),
        lastSyncedAt: oldData.updatedAt || oldData.lastSyncedAt || null,
      };

      // Create new connection document
      const newConnectionRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('boxConnections')
        .add(connectionData);

      console.log(`✅ [Migration] Migrated Box connection ${oldDoc.id} → ${newConnectionRef.id}`);

      // Mark old document as migrated (don't delete yet for safety)
      await oldDocRef.update({
        _migrated: true,
        _migratedTo: newConnectionRef.id,
        _migratedAt: Timestamp.now(),
      });

      migrated++;
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Box migration error: ${errorMsg}`);
    console.error('❌ [Migration] Box migration error:', error);
  }

  return { migrated, errors };
}

/**
 * Migrate Dropbox connections from cloudIntegrations to dropboxConnections
 */
export async function migrateDropboxConnections(organizationId: string): Promise<{
  migrated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migrated = 0;

  try {
    // Check old locations
    const oldLocations = [
      { collection: 'cloudIntegrations', docId: 'dropbox' },
    ];

    // Also check for per-user connections (dropbox_{userId})
    const usersSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('users')
      .get();

    for (const userDoc of usersSnapshot.docs) {
      oldLocations.push({
        collection: 'cloudIntegrations',
        docId: `dropbox_${userDoc.id}`,
      });
    }

    // Try each old location
    for (const location of oldLocations) {
      const oldDocRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection(location.collection)
        .doc(location.docId);

      const oldDoc = await oldDocRef.get();

      if (!oldDoc.exists) {
        continue; // Skip if doesn't exist
      }

      const oldData = oldDoc.data()!;

      // Check if already migrated (connection exists in new location)
      const existingConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('dropboxConnections')
        .where('accountEmail', '==', oldData.accountEmail || '')
        .limit(1)
        .get();

      if (!existingConnections.empty) {
        console.log(`⏭️ [Migration] Dropbox connection for ${oldData.accountEmail} already exists, skipping`);
        continue;
      }

      // Extract connection data
      const connectionData: any = {
        organizationId,
        type: location.docId.includes('_') ? 'user' : 'organization',
        userId: oldData.userId || null,
        accountEmail: oldData.accountEmail || '',
        accountName: oldData.accountName || '',
        accountId: oldData.accountId || null,
        accessToken: oldData.encryptedTokens || oldData.accessToken || '',
        refreshToken: oldData.refreshToken || null,
        tokenExpiresAt: oldData.expiresAt || oldData.tokenExpiresAt || null,
        scopes: oldData.scopes || ['files.content.read', 'files.content.write', 'files.metadata.read'],
        connectedBy: oldData.connectedBy || oldData.userId || 'system',
        isActive: oldData.isActive !== false, // Default to true
        connectedAt: oldData.createdAt || oldData.connectedAt || Timestamp.now(),
        lastSyncedAt: oldData.updatedAt || oldData.lastSyncedAt || null,
      };

      // Create new connection document
      const newConnectionRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('dropboxConnections')
        .add(connectionData);

      console.log(`✅ [Migration] Migrated Dropbox connection ${oldDoc.id} → ${newConnectionRef.id}`);

      // Mark old document as migrated (don't delete yet for safety)
      await oldDocRef.update({
        _migrated: true,
        _migratedTo: newConnectionRef.id,
        _migratedAt: Timestamp.now(),
      });

      migrated++;
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Dropbox migration error: ${errorMsg}`);
    console.error('❌ [Migration] Dropbox migration error:', error);
  }

  return { migrated, errors };
}

/**
 * Migrate Google Drive connections from cloudIntegrations to googleConnections
 */
export async function migrateGoogleConnections(organizationId: string): Promise<{
  migrated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migrated = 0;

  try {
    console.log(`\n📦 [Google] Starting migration for org: ${organizationId}`);
    
    // Check old locations
    const oldLocations = [
      { collection: 'cloudIntegrations', docId: 'google' },
    ];

    // Also check for per-user connections (google_{userId})
    const usersSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('users')
      .get();

    for (const userDoc of usersSnapshot.docs) {
      oldLocations.push({
        collection: 'cloudIntegrations',
        docId: `google_${userDoc.id}`,
      });
    }

    console.log(`   Checking ${oldLocations.length} old locations...`);

    // Try each old location
    for (const location of oldLocations) {
      const oldDocRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection(location.collection)
        .doc(location.docId);

      const oldDoc = await oldDocRef.get();

      if (!oldDoc.exists) {
        continue; // Skip if doesn't exist
      }

      const oldData = oldDoc.data()!;
      console.log(`   ✅ Found connection at: ${location.collection}/${location.docId}`);

      // Check if already migrated (connection exists in new location)
      const existingConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('googleConnections')
        .where('accountEmail', '==', oldData.accountEmail || '')
        .limit(1)
        .get();

      if (!existingConnections.empty) {
        console.log(`   ⏭️  Connection for ${oldData.accountEmail} already exists, skipping`);
        continue;
      }

      // Extract tokens from old format
      let accessToken = '';
      let refreshToken = '';
      let expiresAt = null;

      // Old format uses 'tokens' field (encrypted) or 'encryptedTokens'
      if (oldData.tokens) {
        // Decrypt tokens
        const { decryptTokens } = await import('../integrations/encryption');
        const decrypted = decryptTokens(oldData.tokens);
        accessToken = decrypted.access_token || decrypted.accessToken || '';
        refreshToken = decrypted.refresh_token || decrypted.refreshToken || '';
        expiresAt = decrypted.expiry_date || decrypted.expiresAt || null;
      } else if (oldData.encryptedTokens) {
        const { decryptTokens } = await import('../integrations/encryption');
        const decrypted = decryptTokens(oldData.encryptedTokens);
        accessToken = decrypted.access_token || decrypted.accessToken || '';
        refreshToken = decrypted.refresh_token || decrypted.refreshToken || '';
        expiresAt = decrypted.expiry_date || decrypted.expiresAt || null;
      } else {
        // Plain tokens (if any)
        accessToken = oldData.accessToken || '';
        refreshToken = oldData.refreshToken || '';
        expiresAt = oldData.expiresAt || oldData.tokenExpiresAt || null;
      }

      // Encrypt tokens for new format (use same encryption as Google OAuth)
      // New format uses iv:authTag:encrypted format
      const encryptedAccessToken = accessToken ? encryptTokenForGoogle(accessToken) : '';
      const encryptedRefreshToken = refreshToken ? encryptTokenForGoogle(refreshToken) : undefined;

      // Extract connection data
      const connectionData: any = {
        organizationId,
        type: location.docId.includes('_') ? 'user' : 'organization',
        userId: oldData.userId || null,
        accountEmail: oldData.accountEmail || '',
        accountName: oldData.accountName || '',
        accountId: oldData.accountId || null,
        accessToken: encryptedAccessToken,
        scopes: oldData.scopes || ['https://www.googleapis.com/auth/drive'],
        connectedBy: oldData.connectedBy || oldData.userId || 'system',
        isActive: oldData.isActive !== false, // Default to true
        connectedAt: oldData.createdAt || oldData.connectedAt || Timestamp.now(),
        lastSyncedAt: oldData.updatedAt || oldData.lastSyncedAt || null,
      };

      // Only add refreshToken if it exists
      if (encryptedRefreshToken) {
        connectionData.refreshToken = encryptedRefreshToken;
      }

      // Add expiry if available
      if (expiresAt) {
        if (expiresAt instanceof admin.firestore.Timestamp) {
          connectionData.tokenExpiresAt = expiresAt;
        } else if (typeof expiresAt === 'number') {
          connectionData.tokenExpiresAt = Timestamp.fromMillis(expiresAt);
        } else if (expiresAt instanceof Date) {
          connectionData.tokenExpiresAt = Timestamp.fromDate(expiresAt);
        }
      }

      // Create new connection document
      const newConnectionRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('googleConnections')
        .add(connectionData);

      console.log(`   ✅ Migrated: ${oldDoc.id} → ${newConnectionRef.id} (${oldData.accountEmail || 'no email'})`);

      // Mark old document as migrated (don't delete yet for safety)
      await oldDocRef.update({
        _migrated: true,
        _migratedTo: newConnectionRef.id,
        _migratedAt: Timestamp.now(),
      });

      migrated++;
    }

    if (migrated === 0) {
      console.log(`   ℹ️  No Google Drive connections found to migrate`);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Google Drive migration error: ${errorMsg}`);
    console.error('❌ [Migration] Google Drive migration error:', error);
  }

  return { migrated, errors };
}

/**
 * Callable function to migrate connections for a specific organization
 */
export const migrateCloudIntegrations = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, provider } = data as {
      organizationId?: string;
      provider?: 'box' | 'dropbox' | 'google' | 'all';
    };

    // If organizationId not provided, use from auth token
    const targetOrgId = organizationId || (auth.token.organizationId as string);

    if (!targetOrgId) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

    // Verify user has admin access
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const userData = userDoc.data();

    if (!userData || userData.organizationId !== targetOrgId) {
      throw new HttpsError('permission-denied', 'User does not belong to this organization');
    }

    if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
      throw new HttpsError('permission-denied', 'Only organization admins can run migrations');
    }

    console.log(`🔄 [Migration] Starting migration for org ${targetOrgId}, provider: ${provider || 'all'}`);

    const results: any = {
      organizationId: targetOrgId,
      box: { migrated: 0, errors: [] },
      dropbox: { migrated: 0, errors: [] },
      google: { migrated: 0, errors: [] },
    };

    // Migrate Box
    if (!provider || provider === 'all' || provider === 'box') {
      results.box = await migrateBoxConnections(targetOrgId);
    }

    // Migrate Dropbox
    if (!provider || provider === 'all' || provider === 'dropbox') {
      results.dropbox = await migrateDropboxConnections(targetOrgId);
    }

    // Migrate Google Drive
    if (!provider || provider === 'all' || provider === 'google') {
      results.google = await migrateGoogleConnections(targetOrgId);
    }

    const totalMigrated = results.box.migrated + results.dropbox.migrated + results.google.migrated;
    const totalErrors = results.box.errors.length + results.dropbox.errors.length + results.google.errors.length;

    console.log(`✅ [Migration] Migration complete for org ${targetOrgId}: ${totalMigrated} connections migrated, ${totalErrors} errors`);

    return {
      success: true,
      results,
      summary: {
        totalMigrated,
        totalErrors,
      },
    };
  }
);

/**
 * HTTP endpoint to migrate connections (for admin use)
 */
export const migrateCloudIntegrationsHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    try {
      // Verify admin authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization required' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);

      const { organizationId, provider } = req.body || {};

      const targetOrgId = organizationId || decodedToken.organizationId;

      if (!targetOrgId) {
        res.status(400).json({ error: 'Organization ID is required' });
        return;
      }

      // Verify user has admin access
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.organizationId !== targetOrgId) {
        res.status(403).json({ error: 'Permission denied' });
        return;
      }

      if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      console.log(`🔄 [Migration] Starting HTTP migration for org ${targetOrgId}, provider: ${provider || 'all'}`);

      const results: any = {
        organizationId: targetOrgId,
        box: { migrated: 0, errors: [] },
        dropbox: { migrated: 0, errors: [] },
        google: { migrated: 0, errors: [] },
      };

      // Migrate Box
      if (!provider || provider === 'all' || provider === 'box') {
        results.box = await migrateBoxConnections(targetOrgId);
      }

      // Migrate Dropbox
      if (!provider || provider === 'all' || provider === 'dropbox') {
        results.dropbox = await migrateDropboxConnections(targetOrgId);
      }

      // Migrate Google Drive
      if (!provider || provider === 'all' || provider === 'google') {
        results.google = await migrateGoogleConnections(targetOrgId);
      }

      const totalMigrated = results.box.migrated + results.dropbox.migrated + results.google.migrated;
      const totalErrors = results.box.errors.length + results.dropbox.errors.length + results.google.errors.length;

      console.log(`✅ [Migration] HTTP migration complete for org ${targetOrgId}: ${totalMigrated} connections migrated, ${totalErrors} errors`);

      res.status(200).json({
        success: true,
        results,
        summary: {
          totalMigrated,
          totalErrors,
        },
      });

    } catch (error) {
      console.error('❌ [Migration] HTTP migration error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Migration failed',
      });
    }
  }
);

