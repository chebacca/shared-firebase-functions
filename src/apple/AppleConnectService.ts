/**
 * Apple Connect Service
 * 
 * Main service for Apple Connect integration operations
 * Coordinates OAuth, directory sync, device management, and file storage
 */

import { db } from '../shared/utils';
import { getAppleConnectConfig } from './config';
import { syncDirectory, DirectorySyncConfig, SyncResult } from './DirectorySyncService';
import { getDevices, syncDevices } from './DeviceManagementService';
import { getFiles, syncFiles } from './FileStorageService';

export class AppleConnectService {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Sync directory users and groups
   */
  async syncDirectory(config?: DirectorySyncConfig): Promise<SyncResult> {
    return await syncDirectory(this.organizationId, config);
  }

  /**
   * Get managed devices
   */
  async getDevices() {
    return await getDevices(this.organizationId);
  }

  /**
   * Sync devices from MDM
   */
  async syncDevices() {
    return await syncDevices(this.organizationId);
  }

  /**
   * Get files from iCloud Drive
   */
  async getFiles(folderId?: string) {
    return await getFiles(this.organizationId, folderId);
  }

  /**
   * Sync files from iCloud Drive
   */
  async syncFiles(folderId?: string) {
    return await syncFiles(this.organizationId, folderId);
  }

  /**
   * Get connection status
   */
  async getConnectionStatus() {
    const connectionRef = db
      .collection('organizations')
      .doc(this.organizationId)
      .collection('cloudIntegrations')
      .doc('apple_connect');

    const connectionDoc = await connectionRef.get();

    if (!connectionDoc.exists) {
      return {
        connected: false,
        isConfigured: false,
      };
    }

    const connectionData = connectionDoc.data()!;
    const isConfigured = await this.isConfigured();

    return {
      connected: connectionData.isActive === true,
      accountEmail: connectionData.accountEmail,
      accountName: connectionData.accountName,
      isConfigured,
    };
  }

  /**
   * Check if Apple Connect is configured
   */
  private async isConfigured(): Promise<boolean> {
    try {
      await getAppleConnectConfig(this.organizationId);
      return true;
    } catch {
      return false;
    }
  }
}

