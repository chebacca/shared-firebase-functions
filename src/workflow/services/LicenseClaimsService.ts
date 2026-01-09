/**
 * License Claims Service
 * 
 * 🎯 ENHANCED LICENSE CLAIMS MANAGEMENT
 * - Sets proper Firebase custom claims during license purchase
 * - Validates license status and features
 * - Manages license-based access control
 * - Supports both dashboard and standalone licenses
 */

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export interface LicenseInfo {
  id: string;
  key: string;
  type: 'basic' | 'professional' | 'enterprise' | 'premium' | 'standalone';
  status: 'active' | 'inactive' | 'expired' | 'revoked';
  features: string[];
  maxFiles: number;
  expiresAt: Date | null;
  organizationId?: string;
  userId: string;
}

export interface LicenseClaims {
  // License identification
  licenseId: string;
  licenseKey: string;
  licenseType: string;
  licenseStatus: string;
  licenseTier: string;
  
  // License features and limits
  licenseFeatures: string[];
  maxFiles: number;
  licenseExpiry: number | null;
  
  // Access control
  isDashboardUser: boolean;
  isStandaloneUser: boolean;
  isLicensingUser: boolean;
  
  // Organization and user context
  organizationId: string;
  userId: string;
  
  // Permissions based on license
  permissions: string[];
  
  // Metadata
  claimsVersion: string;
  lastUpdated: number;
}

export class LicenseClaimsService {
  private static readonly CLAIMS_VERSION = '2.0';

  /**
   * Set comprehensive license claims for a user
   */
  static async setLicenseClaims(userId: string, licenseInfo: LicenseInfo): Promise<LicenseClaims> {
    try {
      console.log('🔑 [LicenseClaimsService] Setting license claims for user:', userId);
      
      const auth = getAuth();
      
      // Get current user claims
      const userRecord = await auth.getUser(userId);
      const currentClaims = userRecord.customClaims || {};
      
      // Determine license tier and features
      const licenseTier = this.determineLicenseTier(licenseInfo.type);
      const licenseFeatures = this.getLicenseFeatures(licenseInfo.type, licenseInfo.features);
      const permissions = this.getLicensePermissions(licenseInfo.type, licenseInfo.status);
      
      // Determine user types based on license
      const isDashboardUser = ['professional', 'enterprise', 'premium'].includes(licenseInfo.type);
      const isStandaloneUser = licenseInfo.type === 'standalone';
      const isLicensingUser = ['professional', 'enterprise', 'premium'].includes(licenseInfo.type);
      
      // Build comprehensive license claims
      const licenseClaims: LicenseClaims = {
        // License identification
        licenseId: licenseInfo.id,
        licenseKey: licenseInfo.key,
        licenseType: licenseInfo.type,
        licenseStatus: licenseInfo.status,
        licenseTier: licenseTier,
        
        // License features and limits
        licenseFeatures: licenseFeatures,
        maxFiles: licenseInfo.maxFiles,
        licenseExpiry: licenseInfo.expiresAt ? licenseInfo.expiresAt.getTime() : null,
        
        // Access control
        isDashboardUser: isDashboardUser,
        isStandaloneUser: isStandaloneUser,
        isLicensingUser: isLicensingUser,
        
        // Organization and user context
        organizationId: licenseInfo.organizationId || 'standalone',
        userId: licenseInfo.userId,
        
        // Permissions based on license
        permissions: permissions,
        
        // Metadata
        claimsVersion: this.CLAIMS_VERSION,
        lastUpdated: Date.now()
      };
      
      // Merge with existing claims to preserve other data
      const enhancedClaims = {
        ...currentClaims,
        ...licenseClaims
      };
      
      // Set custom claims
      await auth.setCustomUserClaims(userId, enhancedClaims);
      
      // Update user document with license information
      await this.updateUserDocument(userId, licenseInfo, licenseClaims);
      
      console.log('✅ [LicenseClaimsService] License claims set successfully:', {
        userId,
        licenseType: licenseInfo.type,
        licenseStatus: licenseInfo.status,
        features: licenseFeatures.length,
        permissions: permissions.length
      });
      
      return licenseClaims;
      
    } catch (error) {
      console.error('❌ [LicenseClaimsService] Error setting license claims:', error);
      throw error;
    }
  }

  /**
   * Update license claims after license purchase
   */
  static async updateLicenseClaimsAfterPurchase(userId: string, licenseId: string): Promise<void> {
    try {
      console.log('🛒 [LicenseClaimsService] Updating claims after license purchase:', { userId, licenseId });
      
      const db = getFirestore();
      
      // Get license information
      const licenseDoc = await db.collection('licenses').doc(licenseId).get();
      if (!licenseDoc.exists) {
        throw new Error('License not found');
      }
      
      const licenseData = licenseDoc.data();
      if (!licenseData) {
        throw new Error('License data not found');
      }
      
      const licenseInfo: LicenseInfo = {
        id: licenseDoc.id,
        key: licenseData.key || '',
        type: licenseData.tier || 'basic',
        status: licenseData.status || 'active',
        features: licenseData.features || [],
        maxFiles: licenseData.maxFiles || -1,
        expiresAt: licenseData.expiresAt ? licenseData.expiresAt.toDate() : null,
        organizationId: licenseData.organizationId,
        userId: licenseData.userId || ''
      };
      
      // Set updated claims
      await this.setLicenseClaims(userId, licenseInfo);
      
      console.log('✅ [LicenseClaimsService] License claims updated after purchase');
      
    } catch (error) {
      console.error('❌ [LicenseClaimsService] Error updating claims after purchase:', error);
      throw error;
    }
  }

  /**
   * Set standalone license claims
   */
  static async setStandaloneLicenseClaims(userId: string, licenseKey: string, deviceId: string): Promise<LicenseClaims> {
    try {
      console.log('🔑 [LicenseClaimsService] Setting standalone license claims:', { userId, licenseKey, deviceId });
      
      const db = getFirestore();
      
      // Get standalone license information
      const licenseQuery = await db.collection('standaloneLicenses')
        .where('licenseKey', '==', licenseKey)
        .where('deviceId', '==', deviceId)
        .limit(1)
        .get();
      
      if (licenseQuery.empty) {
        throw new Error('Standalone license not found');
      }
      
      const licenseDoc = licenseQuery.docs[0];
      const licenseData = licenseDoc.data();
      
      const licenseInfo: LicenseInfo = {
        id: licenseDoc.id,
        key: licenseKey,
        type: 'standalone',
        status: licenseData.status || 'active',
        features: licenseData.features || [],
        maxFiles: licenseData.maxFiles || -1,
        expiresAt: licenseData.expiresAt ? licenseData.expiresAt.toDate() : null,
        organizationId: 'standalone',
        userId: userId
      };
      
      // Set standalone claims
      const claims = await this.setLicenseClaims(userId, licenseInfo);
      
      console.log('✅ [LicenseClaimsService] Standalone license claims set successfully');
      
      return claims;
      
    } catch (error) {
      console.error('❌ [LicenseClaimsService] Error setting standalone license claims:', error);
      throw error;
    }
  }

  /**
   * Validate license claims
   */
  static async validateLicenseClaims(userId: string): Promise<{ valid: boolean; claims?: LicenseClaims; error?: string }> {
    try {
      const auth = getAuth();
      const userRecord = await auth.getUser(userId);
      const claims = userRecord.customClaims as LicenseClaims;
      
      if (!claims || !claims.licenseId) {
        return { valid: false, error: 'No license claims found' };
      }
      
      // Check if license is active
      if (claims.licenseStatus !== 'active') {
        return { valid: false, error: 'License is not active' };
      }
      
      // Check if license is not expired
      if (claims.licenseExpiry && claims.licenseExpiry < Date.now()) {
        return { valid: false, error: 'License has expired' };
      }
      
      // Check claims version
      if (claims.claimsVersion !== this.CLAIMS_VERSION) {
        console.warn('⚠️ [LicenseClaimsService] Claims version mismatch, updating...');
        // Could trigger claims update here
      }
      
      return { valid: true, claims };
      
    } catch (error) {
      console.error('❌ [LicenseClaimsService] Error validating license claims:', error);
      return { valid: false, error: 'Failed to validate license claims' };
    }
  }

  /**
   * Revoke license claims
   */
  static async revokeLicenseClaims(userId: string): Promise<void> {
    try {
      console.log('🚫 [LicenseClaimsService] Revoking license claims for user:', userId);
      
      const auth = getAuth();
      const userRecord = await auth.getUser(userId);
      const currentClaims = userRecord.customClaims || {};
      
      // Remove license-related claims
      const updatedClaims = { ...currentClaims };
      delete updatedClaims.licenseId;
      delete updatedClaims.licenseKey;
      delete updatedClaims.licenseType;
      delete updatedClaims.licenseStatus;
      delete updatedClaims.licenseTier;
      delete updatedClaims.licenseFeatures;
      delete updatedClaims.maxFiles;
      delete updatedClaims.licenseExpiry;
      delete updatedClaims.isDashboardUser;
      delete updatedClaims.isStandaloneUser;
      delete updatedClaims.isLicensingUser;
      
      // Set updated claims
      await auth.setCustomUserClaims(userId, updatedClaims);
      
      console.log('✅ [LicenseClaimsService] License claims revoked successfully');
      
    } catch (error) {
      console.error('❌ [LicenseClaimsService] Error revoking license claims:', error);
      throw error;
    }
  }

  /**
   * Determine license tier from type
   */
  private static determineLicenseTier(type: string): string {
    const tierMap: Record<string, string> = {
      'basic': 'basic',
      'professional': 'professional',
      'enterprise': 'enterprise',
      'premium': 'premium',
      'standalone': 'standalone'
    };
    
    return tierMap[type] || 'basic';
  }

  /**
   * Get license features based on type
   */
  private static getLicenseFeatures(type: string, customFeatures: string[] = []): string[] {
    const baseFeatures: Record<string, string[]> = {
      'basic': ['file_upload', 'basic_export'],
      'professional': ['file_upload', 'advanced_export', 'analytics', 'collaboration'],
      'enterprise': ['file_upload', 'advanced_export', 'analytics', 'collaboration', 'admin_tools', 'api_access'],
      'premium': ['file_upload', 'advanced_export', 'analytics', 'collaboration', 'admin_tools', 'api_access', 'priority_support', 'custom_integrations'],
      'standalone': ['file_upload', 'edl_parsing', 'xml_parsing', 'csv_export', 'basic_analytics', 'file_management', 'unlimited_uploads', 'offline_mode']
    };
    
    const features = baseFeatures[type] || baseFeatures['basic'];
    return [...features, ...customFeatures];
  }

  /**
   * Get permissions based on license type and status
   */
  private static getLicensePermissions(type: string, status: string): string[] {
    if (status !== 'active') {
      return ['read:own_data'];
    }
    
    const permissions: Record<string, string[]> = {
      'basic': ['read:own_data', 'write:own_data'],
      'professional': ['read:own_data', 'write:own_data', 'read:team_data', 'write:team_data', 'manage:projects'],
      'enterprise': ['read:own_data', 'write:own_data', 'read:team_data', 'write:team_data', 'manage:projects', 'manage:team', 'admin:organization'],
      'premium': ['read:own_data', 'write:own_data', 'read:team_data', 'write:team_data', 'manage:projects', 'manage:team', 'admin:organization', 'admin:all'],
      'standalone': ['read:own_data', 'write:own_data', 'offline_access', 'unlimited_files']
    };
    
    return permissions[type] || permissions['basic'];
  }

  /**
   * Update user document with license information
   */
  private static async updateUserDocument(userId: string, licenseInfo: LicenseInfo, claims: LicenseClaims): Promise<void> {
    try {
      const db = getFirestore();
      
      const userUpdate = {
        licenseId: licenseInfo.id,
        licenseKey: licenseInfo.key,
        licenseType: licenseInfo.type,
        licenseStatus: licenseInfo.status,
        licenseTier: claims.licenseTier,
        licenseFeatures: claims.licenseFeatures,
        maxFiles: licenseInfo.maxFiles,
        licenseExpiry: licenseInfo.expiresAt,
        isDashboardUser: claims.isDashboardUser,
        isStandaloneUser: claims.isStandaloneUser,
        isLicensingUser: claims.isLicensingUser,
        lastLicenseUpdate: new Date()
      };
      
      await db.collection('users').doc(userId).update(userUpdate);
      
      console.log('✅ [LicenseClaimsService] User document updated with license information');
      
    } catch (error) {
      console.error('❌ [LicenseClaimsService] Error updating user document:', error);
      // Don't throw here as claims are already set
    }
  }
}
