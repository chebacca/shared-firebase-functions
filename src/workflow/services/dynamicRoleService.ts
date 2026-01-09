/**
 * Dynamic Role Service for Firebase Functions
 * 
 * Simplified version of the dynamic role service for Firebase Functions context
 */

import { db } from '../../shared/utils';

export interface AppRoles {
  dashboardRole?: string;
  clipShowProRole?: string;
  callSheetRole?: string;
  cuesheetRole?: string;
}

export interface CreateRoleData {
  name: string;
  description?: string;
  permissions: string[];
  tier: 'BASIC' | 'PRO' | 'ENTERPRISE';
  hierarchy?: number; // OPTIONAL - deprecated, kept for backward compatibility
  organizationId?: string;
  appRoles?: AppRoles; // NEW: Map to app-specific roles
}

export interface Role extends CreateRoleData {
  id: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// Tier features mapping
export const TIER_FEATURES = {
  BASIC: ['read', 'basic_write'],
  PRO: ['read', 'basic_write', 'advanced_write', 'analytics'],
  ENTERPRISE: ['read', 'basic_write', 'advanced_write', 'analytics', 'admin', 'custom_roles']
};

export const dynamicRoleService = {
  /**
   * Check if user has feature access
   */
  hasFeatureAccess(tier: string, feature: string): boolean {
    const tierFeatures = TIER_FEATURES[tier as keyof typeof TIER_FEATURES] || [];
    return tierFeatures.includes(feature);
  },

  /**
   * Check if user has specific permission
   */
  hasPermission(permissions: string[], requiredPermission: string): boolean {
    return permissions.includes(requiredPermission);
  },

  /**
   * Get role with tier filtering
   */
  async getRoleWithTierFiltering(roleId: string, tier: string): Promise<Role | null> {
    return this.getRoleById(roleId);
  },

  /**
   * Get all roles for an organization
   */
  async getRoles(organizationId?: string): Promise<Role[]> {
    try {
      let query = db.collection('roles').where('isActive', '==', true);
      
      if (organizationId) {
        query = query.where('organizationId', '==', organizationId);
      }
      
      const snapshot = await query.get();
      const roles = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as Role[];
      
      return roles;
    } catch (error) {
      console.error('Error getting roles:', error);
      return [];
    }
  },

  /**
   * Get role by ID
   */
  async getRoleById(roleId: string): Promise<Role | null> {
    try {
      const doc = await db.collection('roles').doc(roleId).get();
      if (!doc.exists) return null;
      
      return {
        id: doc.id,
        ...doc.data()
      } as Role;
    } catch (error) {
      console.error('Error getting role by ID:', error);
      return null;
    }
  },

  /**
   * Create a new role
   */
  async createRole(roleData: CreateRoleData, createdBy: string): Promise<Role> {
    try {
      const newRole = {
        ...roleData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy
      };
      
      const docRef = await db.collection('roles').add(newRole);
      
      return {
        id: docRef.id,
        ...newRole
      };
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  },

  /**
   * Update a role
   */
  async updateRole(roleId: string, updates: Partial<CreateRoleData & { isActive: boolean }>): Promise<Role> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date()
      };
      
      await db.collection('roles').doc(roleId).update(updateData);
      
      const updatedDoc = await db.collection('roles').doc(roleId).get();
      return {
        id: updatedDoc.id,
        ...updatedDoc.data()
      } as Role;
    } catch (error) {
      console.error('Error updating role:', error);
      throw error;
    }
  },

  /**
   * Delete a role (soft delete)
   */
  async deleteRole(roleId: string): Promise<boolean> {
    try {
      await db.collection('roles').doc(roleId).update({
        isActive: false,
        updatedAt: new Date()
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting role:', error);
      return false;
    }
  },

  /**
   * Check if role name is unique within organization
   */
  async isRoleNameUnique(name: string, organizationId?: string, excludeRoleId?: string): Promise<boolean> {
    try {
      let query = db.collection('roles')
        .where('name', '==', name)
        .where('isActive', '==', true);
      
      if (organizationId) {
        query = query.where('organizationId', '==', organizationId);
      }
      
      const existingRoles = await query.get();
      const conflictingRoles = existingRoles.docs.filter((doc: any) => doc.id !== excludeRoleId);
      
      return conflictingRoles.length === 0;
    } catch (error) {
      console.error('Error checking role name uniqueness:', error);
      return false;
    }
  }
};
