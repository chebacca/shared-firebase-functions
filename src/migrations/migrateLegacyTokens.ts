/**
 * Migration Function: Legacy Token Format → encryptedTokens
 * 
 * Migrates Box and Dropbox tokens from legacy format (separate accessToken/refreshToken)
 * to new format (encryptedTokens field)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptLegacyToken } from '../integrations/encryption';
import { encryptionKey } from '../box/secrets';

/**
 * Migrate Box tokens for an organization
 */
export const migrateBoxTokens = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Increased from default 256MiB - function runs out of memory during initialization
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { organizationId } = request.data || {};
      const userId = request.auth.uid;
      const userOrgId = request.auth.token.organizationId;

      const targetOrgId = organizationId || userOrgId || 'big-tree-productions';

      if (!targetOrgId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      console.log(`[MigrateBoxTokens] Migrating tokens for org: ${targetOrgId}`);

      // Get the Box integration document
      const integrationDoc = await db
        .collection('organizations')
        .doc(targetOrgId)
        .collection('cloudIntegrations')
        .doc('box')
        .get();

      if (!integrationDoc.exists) {
        throw new HttpsError('not-found', 'Box integration not found');
      }

      const integrationData = integrationDoc.data()!;

      // Check if already migrated
      if (integrationData.encryptedTokens) {
        return {
          success: true,
          message: 'Tokens already migrated',
          alreadyMigrated: true,
        };
      }

      // Check for legacy tokens
      if (!integrationData.accessToken && !integrationData.refreshToken) {
        throw new HttpsError('not-found', 'No legacy tokens found to migrate');
      }

      console.log(`[MigrateBoxTokens] Found legacy tokens, migrating...`);

      let accessToken: string | undefined;
      let refreshToken: string | undefined;

      // Decrypt legacy format if present
      if (integrationData.accessToken) {
        try {
          if (integrationData.accessToken.includes(':')) {
            accessToken = decryptLegacyToken(integrationData.accessToken);
            console.log(`[MigrateBoxTokens] Decrypted accessToken`);
          } else {
            accessToken = integrationData.accessToken;
          }
        } catch (decryptError) {
          console.warn(`[MigrateBoxTokens] Failed to decrypt accessToken:`, decryptError);
          accessToken = integrationData.accessToken;
        }
      }

      if (integrationData.refreshToken) {
        try {
          if (integrationData.refreshToken.includes(':')) {
            refreshToken = decryptLegacyToken(integrationData.refreshToken);
            console.log(`[MigrateBoxTokens] Decrypted refreshToken`);
          } else {
            refreshToken = integrationData.refreshToken;
          }
        } catch (decryptError) {
          console.warn(`[MigrateBoxTokens] Failed to decrypt refreshToken:`, decryptError);
          refreshToken = integrationData.refreshToken;
        }
      }

      if (!accessToken && !refreshToken) {
        throw new HttpsError('invalid-argument', 'No valid tokens found to migrate');
      }

      // Create tokens object
      const migratedTokens = {
        accessToken: accessToken || '',
        refreshToken: refreshToken || '',
        expiresAt: integrationData?.tokenExpiresAt?.toDate?.() ||
                   integrationData?.expiresAt?.toDate?.() ||
                   null,
      };

      // Encrypt with new format
      const encryptedTokens = encryptTokens(migratedTokens);

      // Update document
      await integrationDoc.ref.update({
        encryptedTokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true, // Mark as active after migration
      });

      console.log(`[MigrateBoxTokens] Successfully migrated tokens for org: ${targetOrgId}`);

      return {
        success: true,
        message: 'Box tokens migrated successfully',
        organizationId: targetOrgId,
      };

    } catch (error) {
      console.error('[MigrateBoxTokens] Migration failed:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Migrate Dropbox tokens for an organization
 */
export const migrateDropboxTokens = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { organizationId } = request.data || {};
      const userId = request.auth.uid;
      const userOrgId = request.auth.token.organizationId;

      const targetOrgId = organizationId || userOrgId || 'big-tree-productions';

      if (!targetOrgId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      console.log(`[MigrateDropboxTokens] Migrating tokens for org: ${targetOrgId}`);

      // Get the Dropbox integration document
      const integrationDoc = await db
        .collection('organizations')
        .doc(targetOrgId)
        .collection('cloudIntegrations')
        .doc('dropbox')
        .get();

      if (!integrationDoc.exists) {
        throw new HttpsError('not-found', 'Dropbox integration not found');
      }

      const integrationData = integrationDoc.data()!;

      // Check if already migrated
      if (integrationData.encryptedTokens) {
        return {
          success: true,
          message: 'Tokens already migrated',
          alreadyMigrated: true,
        };
      }

      // Check for legacy tokens
      if (!integrationData.accessToken && !integrationData.refreshToken) {
        throw new HttpsError('not-found', 'No legacy tokens found to migrate');
      }

      console.log(`[MigrateDropboxTokens] Found legacy tokens, migrating...`);

      let accessToken: string | undefined;
      let refreshToken: string | undefined;

      // Decrypt legacy format if present
      if (integrationData.accessToken) {
        try {
          if (integrationData.accessToken.includes(':')) {
            accessToken = decryptLegacyToken(integrationData.accessToken);
            console.log(`[MigrateDropboxTokens] Decrypted accessToken`);
          } else {
            accessToken = integrationData.accessToken;
          }
        } catch (decryptError) {
          console.warn(`[MigrateDropboxTokens] Failed to decrypt accessToken:`, decryptError);
          accessToken = integrationData.accessToken;
        }
      }

      if (integrationData.refreshToken) {
        try {
          if (integrationData.refreshToken.includes(':')) {
            refreshToken = decryptLegacyToken(integrationData.refreshToken);
            console.log(`[MigrateDropboxTokens] Decrypted refreshToken`);
          } else {
            refreshToken = integrationData.refreshToken;
          }
        } catch (decryptError) {
          console.warn(`[MigrateDropboxTokens] Failed to decrypt refreshToken:`, decryptError);
          refreshToken = integrationData.refreshToken;
        }
      }

      if (!accessToken && !refreshToken) {
        throw new HttpsError('invalid-argument', 'No valid tokens found to migrate');
      }

      // Create tokens object
      const migratedTokens = {
        accessToken: accessToken || '',
        refreshToken: refreshToken || '',
        expiresAt: integrationData?.tokenExpiresAt?.toDate?.() ||
                   integrationData?.expiresAt?.toDate?.() ||
                   null,
      };

      // Encrypt with new format
      const encryptedTokens = encryptTokens(migratedTokens);

      // Update document
      await integrationDoc.ref.update({
        encryptedTokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true, // Mark as active after migration
      });

      console.log(`[MigrateDropboxTokens] Successfully migrated tokens for org: ${targetOrgId}`);

      return {
        success: true,
        message: 'Dropbox tokens migrated successfully',
        organizationId: targetOrgId,
      };

    } catch (error) {
      console.error('[MigrateDropboxTokens] Migration failed:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

