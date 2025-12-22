/**
 * Apple Connect Firebase Functions
 * 
 * Exports all Apple Connect related Firebase Functions
 */

export { appleConnectOAuthInitiate, appleConnectOAuthCallback, appleConnectOAuthCallbackHttp, appleConnectRevokeAccess } from './oauth';
export { getAppleConnectConfigStatus } from './config';
export { syncDirectory } from './DirectorySyncService';
export { getDevices, syncDevices } from './DeviceManagementService';
export { getFiles, syncFiles } from './FileStorageService';

// Firebase Functions for directory sync, device management, and file storage
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { encryptionKey } from './secrets';
import { syncDirectory, DirectorySyncConfig } from './DirectorySyncService';
import { getDevices, syncDevices } from './DeviceManagementService';
import { getFiles, syncFiles } from './FileStorageService';
import { getAppleConnectConfigStatus, getAppleConnectConfigStatusInternal } from './config';
import { validateOrganizationAccess } from '../shared/utils';

/**
 * Sync directory from Apple Open Directory
 */
export const appleConnectSyncDirectory = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId, config } = data as {
        organizationId: string;
        config?: DirectorySyncConfig;
      };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      const result = await syncDirectory(organizationId, config);

      return {
        success: result.success,
        syncedUsers: result.syncedUsers,
        syncedGroups: result.syncedGroups,
        errors: result.errors,
      };

    } catch (error) {
      console.error('❌ [AppleConnect] Error syncing directory:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to sync directory');
    }
  }
);

/**
 * Get managed devices
 */
export const appleConnectGetDevices = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId } = data as { organizationId: string };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      const devices = await getDevices(organizationId);

      return {
        success: true,
        devices,
      };

    } catch (error) {
      console.error('❌ [AppleConnect] Error getting devices:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get devices');
    }
  }
);

/**
 * Get files from iCloud Drive
 */
export const appleConnectGetFiles = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId, folderId } = data as {
        organizationId: string;
        folderId?: string;
      };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      const files = await getFiles(organizationId, folderId);

      return {
        success: true,
        files,
      };

    } catch (error) {
      console.error('❌ [AppleConnect] Error getting files:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get files');
    }
  }
);

/**
 * Get Apple Connect configuration status
 */
export const appleConnectGetConfigStatus = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { auth, data } = request;

      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId } = data as { organizationId: string };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Verify user belongs to the organization
      const hasAccess = await validateOrganizationAccess(auth.uid, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      const status = await getAppleConnectConfigStatusInternal(organizationId);

      return status;

    } catch (error) {
      console.error('❌ [AppleConnect] Error getting config status:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get config status');
    }
  }
);

