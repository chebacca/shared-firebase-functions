import { Request, Response, NextFunction } from 'express';
import { dynamicRoleService, TIER_FEATURES } from '../services/dynamicRoleService';

// ============================================================================
// TIER-BASED AUTHENTICATION MIDDLEWARE
// ============================================================================

export type Tier = 'BASIC' | 'PRO' | 'ENTERPRISE';
const tierOrder: Record<Tier, number> = { BASIC: 1, PRO: 2, ENTERPRISE: 3 };

// Type declaration is in main index.ts file to avoid conflicts

/**
 * Require minimum tier level
 */
export const requireTierAtLeast = (minTier: Tier) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const userTier = ((req.user as any).tier || 'BASIC') as Tier;
    
    if (tierOrder[userTier] >= tierOrder[minTier]) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      error: `Requires ${minTier} tier or higher`,
      userTier,
      requiredTier: minTier,
      upgradeRequired: true
    });
  };

/**
 * Require specific feature access
 */
export const requireFeatureAccess = (feature: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const userTier = ((req.user as any).tier || 'BASIC') as Tier;
    const hasAccess = dynamicRoleService.hasFeatureAccess(userTier, feature);

    if (hasAccess) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      error: `Feature '${feature}' requires higher tier`,
      userTier,
      feature,
      upgradeRequired: true
    });
  };

/**
 * Require specific permission (tier + role check)
 * SIMPLIFIED: Works with both flat array and object permission formats from claims
 */
export const requirePermission = (feature: string, action: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const userTier = ((req.user as any).tier || 'BASIC') as Tier;
    const userPermissions = (req.user as any).permissions || {};
    
    let hasPermission = false;

    // Handle both permission formats from claims:
    // 1. Object format: { feature: { action: true } } or { feature: [action1, action2] }
    // 2. Flat array format: ['feature.action', 'feature2.action2']
    if (Array.isArray(userPermissions)) {
      // Flat array format: check for 'feature.action' string
      const permissionString = `${feature}.${action}`;
      hasPermission = userPermissions.includes(permissionString) || 
                     userPermissions.includes(action) ||
                     userPermissions.includes(`${feature}:${action}`);
    } else if (userPermissions[feature]) {
      // Object format: check feature-specific permissions
      const featurePerms = userPermissions[feature];
      if (Array.isArray(featurePerms)) {
        hasPermission = featurePerms.includes(action);
      } else if (typeof featurePerms === 'object') {
        hasPermission = featurePerms[action] === true;
      }
    }

    if (hasPermission) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      error: `Permission denied: ${feature}.${action}`,
      userTier,
      feature,
      action,
      upgradeRequired: !dynamicRoleService.hasFeatureAccess(userTier, feature)
    });
  };

/**
 * Require minimum hierarchy level within organization
 */
export const requireHierarchyAtLeast = (minHierarchy: number) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const userHierarchy = req.user.hierarchy || 0;
    
    if (userHierarchy >= minHierarchy) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      error: `Insufficient hierarchy level`,
      userHierarchy,
      requiredHierarchy: minHierarchy
    });
  };

/**
 * Enhanced authentication middleware that includes tier and role information
 * SIMPLIFIED: Uses claims only - no Firestore lookups
 * Permissions should be synced to user claims via permission matrix
 */
export const enhancedAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Skip authentication for OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No token provided' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    const admin = await import('firebase-admin');
    
    try {
      // Verify Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Extract all information from custom claims (no Firestore lookup)
      const tier = (decodedToken.tier || 'BASIC') as Tier;
      const organizationId = decodedToken.organizationId;
      
      // Get permissions directly from claims (synced by permission matrix)
      const permissions = decodedToken.permissions || {};
      const roleName = decodedToken.roleName || decodedToken.role || 'Team Member';
      const hierarchy = decodedToken.hierarchy || 0;
      
      // Attach enhanced user context to request
      req.user = {
        ...decodedToken,
        tier: tier as any,
        customRoleId: decodedToken.customRoleId as any,
        roleName: roleName as any,
        hierarchy: hierarchy as any,
        organizationId: organizationId as any,
        permissions: permissions as any
      } as any;
      
      console.log(`✅ [TierAuth] User authenticated: ${decodedToken.email} (${tier}, ${roleName})`);
      return next();
      
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: Invalid token' 
      });
    }
    
  } catch (error) {
    console.error('Enhanced auth middleware error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
};

/**
 * Middleware to attach tier and feature information to response
 */
export const attachTierInfoMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.user) {
    const userTier = ((req.user as any).tier || 'BASIC') as Tier;
    const availableFeatures = TIER_FEATURES[userTier] || [];
    
    // Attach tier info to response headers for client-side feature gating
    res.setHeader('X-User-Tier', userTier);
    res.setHeader('X-Available-Features', JSON.stringify(availableFeatures));
    res.setHeader('X-User-Hierarchy', req.user.hierarchy?.toString() || '0');
  }
  
  next();
};

/**
 * Helper function to check if user can access route based on tier
 */
export const canAccessRoute = (userTier: Tier, route: string): boolean => {
  const routeFeatureMap: Record<string, string> = {
    '/command-center': 'commandCenter',
    '/inventory': 'inventory.core',
    '/network-ip': 'ipam.core',
    '/maps': 'maps.core',
    '/unified-workflow': 'workflow.unified',
    '/unified-reviews': 'reviews.core',
    '/timecard/templates': 'timecards.approval',
    '/timecard/analytics': 'analytics.core',
    '/admin': 'admin.org',
    '/rtc': 'rtc.turn',
    '/budget': 'budget',
    '/invoices': 'invoices',
    '/rwa-blockchain': 'rwa.blockchain'
  };
  
  const requiredFeature = routeFeatureMap[route];
  if (!requiredFeature) return true; // Allow access to unmapped routes
  
  return dynamicRoleService.hasFeatureAccess(userTier, requiredFeature);
};

/**
 * Route-level tier gating middleware
 */
export const gateRouteByTier = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }
  
  const userTier = ((req.user as any).tier || 'BASIC') as Tier;
  const route = req.path;
  
  if (canAccessRoute(userTier, route)) {
    return next();
  }
  
  return res.status(403).json({ 
    success: false, 
    error: `Route '${route}' requires higher tier`,
    userTier,
    route,
    upgradeRequired: true
  });
};

