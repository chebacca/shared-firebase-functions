/**
 * 🔥 APP ROLE DEFINITION SERVICE
 * 
 * Manages app role definitions (system defaults + organization custom)
 * for the hybrid dynamic app role system.
 */

import { db, createFieldValue } from '../shared/utils';

// Type definitions
export type AppName = 'dashboard' | 'clipShowPro' | 'callSheet' | 'cuesheet';

export interface AppRoleDefinition {
  id: string;
  organizationId: string | null;
  appName: AppName;
  roleValue: string;
  displayName: string;
  description?: string;
  permissions?: string[];
  hierarchy?: number;
  equivalentEnum?: string;
  isSystemDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

// Role enum definitions for system defaults
const DashboardRole = {
  ADMIN: 'ADMIN',
  EXEC: 'EXEC',
  MANAGER: 'MANAGER',
  POST_COORDINATOR: 'POST_COORDINATOR',
  PRODUCER: 'PRODUCER',
  ASSOCIATE_PRODUCER: 'ASSOCIATE_PRODUCER',
  POST_PRODUCER: 'POST_PRODUCER',
  LINE_PRODUCER: 'LINE_PRODUCER',
  DIRECTOR: 'DIRECTOR',
  EDITOR: 'EDITOR',
  ASSISTANT_EDITOR: 'ASSISTANT_EDITOR',
  WRITER: 'WRITER',
  LICENSING_SPECIALIST: 'LICENSING_SPECIALIST',
  MEDIA_MANAGER: 'MEDIA_MANAGER',
  PRODUCTION_ASSISTANT: 'PRODUCTION_ASSISTANT',
  VIEWER: 'VIEWER',
  // NEW roles
  AUDIO_POST: 'AUDIO_POST',
  AUDIO_PRODUCTION: 'AUDIO_PRODUCTION',
  AUDIO_MIXER: 'AUDIO_MIXER',
  SOUND_ENGINEER: 'SOUND_ENGINEER',
  COLORIST: 'COLORIST',
  GFX_ARTIST: 'GFX_ARTIST',
  CAMERA_OPERATOR: 'CAMERA_OPERATOR',
  QC_SPECIALIST: 'QC_SPECIALIST',
  DIT: 'DIT',
  LOCATION_MANAGER: 'LOCATION_MANAGER',
  PRODUCTION_MANAGER: 'PRODUCTION_MANAGER',
  POST_SUPERVISOR: 'POST_SUPERVISOR',
  POST_PA: 'POST_PA',
  GUEST: 'GUEST'
} as const;

const ClipShowProRole = {
  PRODUCER: 'PRODUCER',
  SUPERVISING_PRODUCER: 'SUPERVISING_PRODUCER',
  SERIES_PRODUCER: 'SERIES_PRODUCER',
  ASSOCIATE_PRODUCER: 'ASSOCIATE_PRODUCER',
  DIRECTOR: 'DIRECTOR',
  WRITER: 'WRITER',
  EDITOR: 'EDITOR',
  ASSISTANT_EDITOR: 'ASSISTANT_EDITOR',
  ASSEMBLY_EDITOR: 'ASSEMBLY_EDITOR',
  LICENSING_SPECIALIST: 'LICENSING_SPECIALIST',
  CLEARANCE_COORDINATOR: 'CLEARANCE_COORDINATOR',
  RESEARCHER: 'RESEARCHER',
  POST_PRODUCER: 'POST_PRODUCER',
  LINE_PRODUCER: 'LINE_PRODUCER',
  PRODUCTION_ASSISTANT: 'PRODUCTION_ASSISTANT',
  MEDIA_MANAGER: 'MEDIA_MANAGER'
} as const;

const CallSheetRole = {
  ADMIN: 'ADMIN',
  PRODUCER: 'PRODUCER',
  COORDINATOR: 'COORDINATOR',
  MEMBER: 'MEMBER'
} as const;

const CuesheetRole = {
  PRODUCER: 'PRODUCER',
  SUPERVISING_PRODUCER: 'SUPERVISING_PRODUCER',
  SERIES_PRODUCER: 'SERIES_PRODUCER',
  ASSOCIATE_PRODUCER: 'ASSOCIATE_PRODUCER',
  DIRECTOR: 'DIRECTOR',
  WRITER: 'WRITER',
  EDITOR: 'EDITOR',
  ASSISTANT_EDITOR: 'ASSISTANT_EDITOR',
  ASSEMBLY_EDITOR: 'ASSEMBLY_EDITOR',
  LICENSING_SPECIALIST: 'LICENSING_SPECIALIST',
  CLEARANCE_COORDINATOR: 'CLEARANCE_COORDINATOR',
  RESEARCHER: 'RESEARCHER',
  POST_PRODUCER: 'POST_PRODUCER',
  LINE_PRODUCER: 'LINE_PRODUCER',
  PRODUCTION_ASSISTANT: 'PRODUCTION_ASSISTANT',
  MEDIA_MANAGER: 'MEDIA_MANAGER',
  ADMIN: 'ADMIN',
  VIEWER: 'VIEWER'
} as const;

// System default enum maps for fast validation
const SYSTEM_DEFAULT_ENUMS: Record<AppName, Record<string, string>> = {
  dashboard: DashboardRole as any,
  clipShowPro: ClipShowProRole as any,
  callSheet: CallSheetRole as any,
  cuesheet: CuesheetRole as any
};

// Validation function
function validateAppRoleValue(roleValue: string): { valid: boolean; error?: string } {
  const pattern = /^[A-Z][A-Z0-9_]*$/;
  
  if (!pattern.test(roleValue)) {
    return {
      valid: false,
      error: 'Role value must be uppercase with underscores only (e.g., VFX_SUPERVISOR)'
    };
  }
  
  if (roleValue.length < 2) {
    return {
      valid: false,
      error: 'Role value must be at least 2 characters'
    };
  }
  
  if (roleValue.length > 50) {
    return {
      valid: false,
      error: 'Role value must be no more than 50 characters'
    };
  }
  
  return { valid: true };
}

export class AppRoleDefinitionService {
  private static instance: AppRoleDefinitionService;
  private systemDefaultsCache: Map<AppName, AppRoleDefinition[]> = new Map();
  private customRolesCache: Map<string, Map<AppName, AppRoleDefinition[]>> = new Map();

  private constructor() {}

  static getInstance(): AppRoleDefinitionService {
    if (!AppRoleDefinitionService.instance) {
      AppRoleDefinitionService.instance = new AppRoleDefinitionService();
    }
    return AppRoleDefinitionService.instance;
  }

  /**
   * Check if a role value is a system default (using enum check)
   */
  isSystemDefaultRoleValue(roleValue: string, appName: AppName): boolean {
    const enumMap = SYSTEM_DEFAULT_ENUMS[appName];
    if (!enumMap) return false;
    return Object.values(enumMap).includes(roleValue as any);
  }

  /**
   * Get system default app role definitions
   * Always uses enum as source of truth, merges with Firestore if available
   */
  async getSystemDefaults(appName: AppName, useCache: boolean = true): Promise<AppRoleDefinition[]> {
    // Check cache first
    if (useCache && this.systemDefaultsCache.has(appName)) {
      return this.systemDefaultsCache.get(appName)!;
    }

    // Always start with enum values as source of truth
    const enumRoles = this.getSystemDefaultsFromEnum(appName);

    try {
      // Try to get Firestore roles and merge with enum (Firestore may have custom metadata)
      const snapshot = await db.collection('appRoleDefinitions')
        .where('organizationId', '==', null)
        .where('appName', '==', appName)
        .where('isActive', '==', true)
        .get();

      const firestoreRoles = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as AppRoleDefinition[];

      // Merge: Use Firestore roles if they exist and match enum, otherwise use enum
      // This ensures all enum roles are always present
      const mergedRoles: AppRoleDefinition[] = [];
      
      // Add all enum roles (source of truth)
      for (const enumRole of enumRoles) {
        const firestoreRole = firestoreRoles.find(r => r.roleValue === enumRole.roleValue);
        if (firestoreRole) {
          // Use Firestore version (may have custom metadata) but ensure it's marked as system default
          mergedRoles.push({
            ...firestoreRole,
            isSystemDefault: true
          });
        } else {
          // Use enum version
          mergedRoles.push(enumRole);
        }
      }

      // Cache the results
      this.systemDefaultsCache.set(appName, mergedRoles);

      return mergedRoles;
    } catch (error) {
      console.error(`[AppRoleDefinitionService] Error getting system defaults for ${appName}:`, error);
      // Fallback to enum values if Firestore query fails
      this.systemDefaultsCache.set(appName, enumRoles);
      return enumRoles;
    }
  }

  /**
   * Fallback: Get system defaults from enum (if Firestore not available)
   */
  private getSystemDefaultsFromEnum(appName: AppName): AppRoleDefinition[] {
    const enumMap = SYSTEM_DEFAULT_ENUMS[appName];
    if (!enumMap) return [];

    return Object.values(enumMap).map((roleValue: string) => ({
      id: `system-${appName}-${roleValue}`,
      organizationId: null,
      appName: appName,
      roleValue: roleValue,
      displayName: roleValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: `System default ${roleValue} role`,
      isSystemDefault: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })) as AppRoleDefinition[];
  }

  /**
   * Get organization custom app role definitions
   */
  async getOrganizationCustomRoles(orgId: string, appName: AppName, useCache: boolean = true): Promise<AppRoleDefinition[]> {
    // Check cache first
    if (useCache) {
      const orgCache = this.customRolesCache.get(orgId);
      if (orgCache && orgCache.has(appName)) {
        return orgCache.get(appName)!;
      }
    }

    try {
      const snapshot = await db.collection('appRoleDefinitions')
        .where('organizationId', '==', orgId)
        .where('appName', '==', appName)
        .where('isActive', '==', true)
        .get();

      const roles = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as AppRoleDefinition[];

      // Cache the results
      if (!this.customRolesCache.has(orgId)) {
        this.customRolesCache.set(orgId, new Map());
      }
      this.customRolesCache.get(orgId)!.set(appName, roles);

      return roles;
    } catch (error) {
      console.error(`[AppRoleDefinitionService] Error getting custom roles for ${orgId}/${appName}:`, error);
      return [];
    }
  }

  /**
   * Get all available app roles (system defaults + organization custom)
   */
  async getAvailableAppRoles(orgId: string, appName: AppName): Promise<AppRoleDefinition[]> {
    const [systemDefaults, customRoles] = await Promise.all([
      this.getSystemDefaults(appName),
      this.getOrganizationCustomRoles(orgId, appName)
    ]);

    // Combine and sort: system defaults first, then custom
    return [...systemDefaults, ...customRoles];
  }

  /**
   * Get all available role values as strings
   */
  async getAvailableRoleValues(orgId: string, appName: AppName): Promise<string[]> {
    const roles = await this.getAvailableAppRoles(orgId, appName);
    return roles.map(role => role.roleValue);
  }

  /**
   * Validate if a role value is valid for an organization
   */
  async validateAppRole(orgId: string, appName: AppName, roleValue: string): Promise<{ valid: boolean; error?: string; isSystemDefault?: boolean }> {
    // First check format
    const formatValidation = validateAppRoleValue(roleValue);
    if (!formatValidation.valid) {
      return formatValidation;
    }

    // Check if it's a system default (fast enum check)
    const isSystemDefault = this.isSystemDefaultRoleValue(roleValue, appName);
    if (isSystemDefault) {
      return { valid: true, isSystemDefault: true };
    }

    // Check if it's an organization custom role
    const customRoles = await this.getOrganizationCustomRoles(orgId, appName);
    const exists = customRoles.some(role => role.roleValue === roleValue);

    if (exists) {
      return { valid: true, isSystemDefault: false };
    }

    return {
      valid: false,
      error: `Role value "${roleValue}" is not available for ${appName}. It must be a system default or a custom role created by your organization.`
    };
  }

  /**
   * Create a custom app role definition
   */
  async createCustomAppRole(
    orgId: string,
    appName: AppName,
    role: {
      roleValue: string;
      displayName: string;
      description?: string;
      permissions?: string[];
      hierarchy?: number;
      equivalentEnum?: string;
    },
    createdBy: string
  ): Promise<AppRoleDefinition> {
    // Validate format
    const formatValidation = validateAppRoleValue(role.roleValue);
    if (!formatValidation.valid) {
      throw new Error(formatValidation.error || 'Invalid role value format');
    }

    // Check if it conflicts with system default (case-insensitive)
    if (this.isSystemDefaultRoleValue(role.roleValue, appName)) {
      throw new Error(`Role value "${role.roleValue}" conflicts with a system default. Please choose a different value.`);
    }

    // Check if it already exists for this organization
    const existing = await db.collection('appRoleDefinitions')
      .where('organizationId', '==', orgId)
      .where('appName', '==', appName)
      .where('roleValue', '==', role.roleValue)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new Error(`Role value "${role.roleValue}" already exists for ${appName} in your organization.`);
    }

    // Create the custom role
    const roleData: any = {
      organizationId: orgId,
      appName: appName,
      roleValue: role.roleValue,
      displayName: role.displayName,
      description: role.description || '',
      permissions: role.permissions || [],
      hierarchy: role.hierarchy,
      isSystemDefault: false,
      isActive: true,
      createdAt: createFieldValue().serverTimestamp(),
      updatedAt: createFieldValue().serverTimestamp(),
      createdBy: createdBy
    };

    // Add equivalentEnum if provided
    if (role.equivalentEnum) {
      roleData.equivalentEnum = role.equivalentEnum;
    }

    const docRef = await db.collection('appRoleDefinitions').add(roleData);

    // Invalidate cache
    this.invalidateCache(orgId, appName);

    return {
      id: docRef.id,
      ...roleData,
      createdAt: new Date(),
      updatedAt: new Date()
    } as AppRoleDefinition;
  }

  /**
   * Update a custom app role definition
   */
  async updateCustomAppRole(
    orgId: string,
    appName: AppName,
    roleId: string,
    updates: Partial<{
      displayName: string;
      description: string;
      permissions: string[];
      hierarchy: number;
    }>
  ): Promise<AppRoleDefinition> {
    // Verify the role belongs to the organization and is not a system default
    const roleDoc = await db.collection('appRoleDefinitions').doc(roleId).get();
    
    if (!roleDoc.exists) {
      throw new Error('Role definition not found');
    }

    const roleData = roleDoc.data() as AppRoleDefinition;
    
    if (roleData.organizationId !== orgId) {
      throw new Error('Access denied: Role does not belong to your organization');
    }

    if (roleData.isSystemDefault) {
      throw new Error('Cannot update system default roles');
    }

    // Update the role
    const updateData = {
      ...updates,
      updatedAt: createFieldValue().serverTimestamp()
    };

    await db.collection('appRoleDefinitions').doc(roleId).update(updateData);

    // Invalidate cache
    this.invalidateCache(orgId, appName);

    // Return updated role
    const updatedDoc = await db.collection('appRoleDefinitions').doc(roleId).get();
    return {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      createdAt: roleData.createdAt,
      updatedAt: new Date()
    } as AppRoleDefinition;
  }

  /**
   * Delete (soft delete) a custom app role definition
   */
  async deleteCustomAppRole(orgId: string, appName: AppName, roleId: string): Promise<boolean> {
    // Verify the role belongs to the organization and is not a system default
    const roleDoc = await db.collection('appRoleDefinitions').doc(roleId).get();
    
    if (!roleDoc.exists) {
      throw new Error('Role definition not found');
    }

    const roleData = roleDoc.data() as AppRoleDefinition;
    
    if (roleData.organizationId !== orgId) {
      throw new Error('Access denied: Role does not belong to your organization');
    }

    if (roleData.isSystemDefault) {
      throw new Error('Cannot delete system default roles');
    }

    // Soft delete
    await db.collection('appRoleDefinitions').doc(roleId).update({
      isActive: false,
      updatedAt: createFieldValue().serverTimestamp()
    });

    // Invalidate cache
    this.invalidateCache(orgId, appName);

    return true;
  }

  /**
   * Invalidate cache for an organization and app
   */
  private invalidateCache(orgId: string, appName: AppName): void {
    const orgCache = this.customRolesCache.get(orgId);
    if (orgCache) {
      orgCache.delete(appName);
    }
  }

  /**
   * Clear all caches (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.systemDefaultsCache.clear();
    this.customRolesCache.clear();
  }
}

export const appRoleDefinitionService = AppRoleDefinitionService.getInstance();

