/**
 * ============================================================================
 * PROJECT ROLE AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * 
 * Enhanced authentication middleware that resolves project-specific roles
 * and integrates with the existing user role system from UserManagementPage.tsx
 */

import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';

const db = admin.firestore();

// Extend Express Request to include project role information
declare global {
  namespace Express {
    interface Request {
      projectRole?: {
        id: string;
        name: string;
        displayName: string;
        category: string;
        hierarchy: number;
        baseRole: string;
        permissions: any;
        projectId: string;
      };
      effectivePermissions?: any;
      hasProjectAccess?: boolean;
    }
  }
}

/**
 * Middleware to resolve project-specific roles for authenticated users
 * SIMPLIFIED: Uses claims first (projectAssignments), only falls back to Firestore if needed
 */
export const projectRoleMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip if no authenticated user
    if (!req.user) {
      return next();
    }

    const { uid } = req.user;
    const projectId = req.params.projectId || req.body.projectId || req.query.projectId;

    // Skip if no project context
    if (!projectId) {
      return next();
    }

    console.log(`🔐 [PROJECT ROLE AUTH] Resolving project role for user ${uid} in project ${projectId}`);

    // PRIORITY 1: Check projectAssignments from claims (fastest, no Firestore lookup)
    const projectAssignments = (req.user as any).projectAssignments || {};
    const projectAssignment = projectAssignments[projectId];

    if (projectAssignment) {
      req.hasProjectAccess = true;
      
      // Use project assignment from claims
      req.projectRole = {
        id: projectAssignment.roleId || '',
        name: projectAssignment.role || '',
        displayName: projectAssignment.role || '',
        category: 'project',
        hierarchy: projectAssignment.hierarchy || 0,
        baseRole: projectAssignment.baseRole || projectAssignment.role || '',
        permissions: projectAssignment.permissions || {},
        projectId
      };

      // Merge project permissions with base user permissions from claims
      req.effectivePermissions = mergePermissions(
        (req.user as any).permissions || {},
        projectAssignment.permissions || {}
      );

      console.log(`✅ [PROJECT ROLE AUTH] Resolved from claims: ${projectAssignment.role} (${projectAssignment.hierarchy})`);
      return next();
    }

    // PRIORITY 2: Fallback to Firestore lookup (only if not in claims)
    console.log(`⚠️ [PROJECT ROLE AUTH] Project assignment not in claims, checking Firestore...`);
    
    const projectAssignmentSnapshot = await db.collection('projectAssignments')
      .where('projectId', '==', projectId)
      .where('userId', '==', uid)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (projectAssignmentSnapshot.empty) {
      console.log(`❌ [PROJECT ROLE AUTH] User ${uid} not assigned to project ${projectId}`);
      req.hasProjectAccess = false;
      return next();
    }

    req.hasProjectAccess = true;

    // Get project-specific role assignment from Firestore
    const roleAssignmentSnapshot = await db.collection('projectRoleAssignments')
      .where('projectId', '==', projectId)
      .where('teamMemberId', '==', uid)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!roleAssignmentSnapshot.empty) {
      const roleAssignment = roleAssignmentSnapshot.docs[0].data();
      
      // Get the project role details
      const projectRoleDoc = await db.collection('projectRoles').doc(roleAssignment.projectRoleId).get();
      
      if (projectRoleDoc.exists) {
        const projectRoleData = projectRoleDoc.data();
        
        req.projectRole = {
          id: projectRoleDoc.id,
          name: projectRoleData?.name || '',
          displayName: projectRoleData?.displayName || '',
          category: projectRoleData?.category || 'project',
          hierarchy: projectRoleData?.hierarchy || 0,
          baseRole: projectRoleData?.baseRole || '',
          permissions: projectRoleData?.permissions || {},
          projectId: projectId
        };

        // Merge project permissions with base user permissions
        req.effectivePermissions = mergePermissions(
          (req.user as any).permissions || {},
          projectRoleData?.permissions || {}
        );

        console.log(`✅ [PROJECT ROLE AUTH] Resolved from Firestore: ${projectRoleData?.displayName} (${projectRoleData?.hierarchy})`);
      }
    } else {
      // User has project access but no specific role assigned
      console.log(`⚠️ [PROJECT ROLE AUTH] User ${uid} has project access but no specific role assigned`);
      req.effectivePermissions = (req.user as any).permissions || {};
    }

    next();
  } catch (error: any) {
    console.error('❌ [PROJECT ROLE AUTH] Error resolving project role:', error);
    // Don't fail the request, just continue without project role
    next();
  }
};

/**
 * Merge base user permissions with project-specific permissions
 * Project permissions take precedence over base permissions
 */
function mergePermissions(basePermissions: any, projectPermissions: any): any {
  const merged = { ...basePermissions };

  // Merge each permission category
  Object.keys(projectPermissions).forEach(category => {
    if (projectPermissions[category] && typeof projectPermissions[category] === 'object') {
      merged[category] = {
        ...merged[category],
        ...projectPermissions[category]
      };
    }
  });

  return merged;
}

/**
 * Check if user has specific permission in project context
 */
export const hasProjectPermission = (req: Request, category: string, permission: string): boolean => {
  const effectivePermissions = req.effectivePermissions || (req.user as any)?.permissions || {};
  return effectivePermissions[category]?.[permission] === true;
};

/**
 * Check if user has minimum hierarchy level in project
 */
export const hasMinimumHierarchy = (req: Request, minLevel: number): boolean => {
  // Check project role hierarchy first
  if (req.projectRole && req.projectRole.hierarchy >= minLevel) {
    return true;
  }

  // Fall back to base user role hierarchy
  const userRole = req.user?.role;
  if (!userRole) return false;
  const userHierarchy = getUserHierarchy(userRole);
  return userHierarchy >= minLevel;
};

/**
 * Get hierarchy level for base user roles
 */
function getUserHierarchy(userRole: string): number {
  const roleHierarchy: Record<string, number> = {
    'ADMIN': 100,
    'MANAGER': 80,
    'PRODUCER': 70,
    'DIRECTOR': 70,
    'POST_COORDINATOR': 65,
    'EDITOR': 60,
    'ASSISTANT_EDITOR': 50,
    'PRODUCTION_ASSISTANT': 30,
    'GUEST': 10
  };

  return roleHierarchy[userRole] || 0;
}

/**
 * Middleware to require specific project permission
 */
export const requireProjectPermission = (category: string, permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.hasProjectAccess) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Not assigned to this project'
      });
      return;
    }

    if (!hasProjectPermission(req, category, permission)) {
      res.status(403).json({
        success: false,
        error: `Access denied: Missing ${category}.${permission} permission`
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require minimum hierarchy level
 */
export const requireMinimumHierarchy = (minLevel: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.hasProjectAccess) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Not assigned to this project'
      });
      return;
    }

    if (!hasMinimumHierarchy(req, minLevel)) {
      res.status(403).json({
        success: false,
        error: `Access denied: Insufficient hierarchy level (required: ${minLevel})`
      });
      return;
    }

    next();
  };
};

/**
 * Get user's effective role in project context
 */
export const getEffectiveRole = (req: Request): string => {
  if (req.projectRole) {
    return req.projectRole.baseRole;
  }
  return req.user?.role || 'GUEST';
};

/**
 * Check if user can manage roles in project
 */
export const canManageProjectRoles = (req: Request): boolean => {
  // Must have project access
  if (!req.hasProjectAccess) {
    return false;
  }

  // Check if user has role management permission
  if (hasProjectPermission(req, 'userManagement', 'manage_roles')) {
    return true;
  }

  // Check if user has sufficient hierarchy (80+ can manage roles)
  if (hasMinimumHierarchy(req, 80)) {
    return true;
  }

  return false;
};

/**
 * Middleware to require role management permission
 */
export const requireRoleManagement = (req: Request, res: Response, next: NextFunction): void => {
  if (!canManageProjectRoles(req)) {
    res.status(403).json({
      success: false,
      error: 'Access denied: Cannot manage roles in this project'
    });
    return;
  }
  next();
};
