/**
 * Enhanced Authentication Middleware
 * Extends existing Firebase auth without conflicts
 */

import { Request, Response, NextFunction } from 'express';
import { dynamicRoleService } from '../services/dynamicRoleService';

export type Tier = 'BASIC' | 'PRO' | 'ENTERPRISE';

// Type declaration is in main index.ts file to avoid conflicts

/**
 * Middleware that enhances existing auth with tier/role information
 * This runs AFTER the existing authenticateToken middleware
 */
export const enhanceAuthWithTiers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only enhance if user is already authenticated
    if (!req.user) {
      return next();
    }

    // Extract tier and role information from custom claims
    const tier = (req.user.tier || 'BASIC') as Tier;
    const customRoleId = req.user.customRoleId;
    const organizationId = req.user.organizationId;
    
    // Get role permissions if available
    let permissions = (req.user as any).permissions || {};
    let roleName = (req.user as any).roleName || 'Team Member';
    let hierarchy: number = (req.user as any).hierarchy || 0;
    
    // If we have a custom role ID, get the latest permissions
    if (customRoleId && organizationId) {
      try {
        const role = await dynamicRoleService.getRoleById(customRoleId);
        if (role) {
          permissions = role.permissions;
          roleName = role.name;
          hierarchy = role.hierarchy || 0;
        }
      } catch (error) {
        console.warn('Failed to get role permissions, using cached:', error);
      }
    }
    
    // Attach enhanced user context to request (separate from existing user)
    // Update user object with enhanced properties
    req.user = {
      ...req.user,
      tier,
      customRoleId,
      roleName,
      hierarchy,
      organizationId,
      permissions
    } as any;
    
    console.log(`Enhanced auth for user ${req.user?.uid}: tier=${tier}, role=${roleName}, hierarchy=${hierarchy}`);
    next();
    
  } catch (error) {
    console.error('Enhanced auth middleware error:', error);
    // Don't fail the request, just continue without enhancement
    next();
  }
};

/**
 * Middleware to require minimum tier level
 */
export const requireTierAtLeast = (minTier: Tier) => 
  (req: Request, res: Response, next: NextFunction) => {
    const tierOrder: Record<Tier, number> = { BASIC: 1, PRO: 2, ENTERPRISE: 3 };
    const userTier = req.user?.tier || 'BASIC';
    
    if (tierOrder[userTier as Tier] >= tierOrder[minTier]) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Insufficient tier level',
        required: minTier,
        current: userTier
      });
    }
  };

/**
 * Middleware to require minimum hierarchy level
 */
export const requireHierarchyAtLeast = (minHierarchy: number) => 
  (req: Request, res: Response, next: NextFunction) => {
    const userHierarchy = req.user?.hierarchy || 0;
    
    if (userHierarchy >= minHierarchy) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Insufficient hierarchy level',
        required: minHierarchy,
        current: userHierarchy
      });
    }
  };

/**
 * Middleware to require specific permission
 */
export const requirePermission = (feature: string, action: string) => 
  (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.user?.permissions || {};
    const featurePermissions = permissions[feature];
    
    if (featurePermissions && featurePermissions[action] === true) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: `${feature}.${action}`,
        userPermissions: Object.keys(permissions)
      });
    }
  };

/**
 * Middleware to check feature access based on tier
 */
export const requireFeatureAccess = (feature: string) => 
  (req: Request, res: Response, next: NextFunction) => {
    const tier = req.user?.tier || 'BASIC';
    
    // Define tier features (matches frontend)
    const tierFeatures: Record<Tier, string[]> = {
      BASIC: [
        'projects.core', 'files.basic', 'callsheets.basic', 'timecards.submit',
        'chat.basic', 'reports.basic', 'export.basic', 'dashboard.view', 'profile.edit'
      ],
      PRO: [
        'projects.core', 'files.basic', 'callsheets.basic', 'timecards.submit', 'chat.basic',
        'reports.basic', 'export.basic', 'dashboard.view', 'profile.edit', 'reviews.core',
        'qc.core', 'workflow.unified', 'scheduler', 'timecards.approval', 'analytics.core',
        'commandCenter', 'media.indexing', 'inventory.core', 'portfolio.core',
        'integrations.slack', 'maps.core', 'ipam.core', 'export.advanced'
      ],
      ENTERPRISE: [
        'projects.core', 'files.basic', 'callsheets.basic', 'timecards.submit', 'chat.basic',
        'reports.basic', 'export.basic', 'dashboard.view', 'profile.edit', 'reviews.core',
        'qc.core', 'workflow.unified', 'scheduler', 'timecards.approval', 'analytics.core',
        'commandCenter', 'media.indexing', 'inventory.core', 'portfolio.core',
        'integrations.slack', 'maps.core', 'ipam.core', 'export.advanced', 'admin.org',
        'sso.scim', 'audit.export', 'apple.directory', 'rtc.turn', 'budget', 'invoices',
        'integrations.enterprise', 'rwa.blockchain', 'api.keys', 'sla.support',
        'white.label', 'on.premise'
      ]
    };
    
    const availableFeatures = tierFeatures[tier as Tier] || [];
    
    if (availableFeatures.includes(feature)) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Feature not available in current tier',
        feature,
        currentTier: tier,
        availableFeatures
      });
    }
  };

/**
 * Utility to get tier-based limits
 */
export const getTierLimits = (tier: Tier) => {
  const limits = {
    BASIC: {
      maxTeamMembers: 5,
      maxProjects: 10,
      maxStorage: '10GB',
      maxIntegrations: 2
    },
    PRO: {
      maxTeamMembers: 25,
      maxProjects: 100,
      maxStorage: '100GB',
      maxIntegrations: 10
    },
    ENTERPRISE: {
      maxTeamMembers: -1, // Unlimited
      maxProjects: -1,    // Unlimited
      maxStorage: '1TB',
      maxIntegrations: -1 // Unlimited
    }
  };
  
  return limits[tier] || limits.BASIC;
};

