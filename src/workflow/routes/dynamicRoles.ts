import { Router } from 'express';
import { enhancedAuthMiddleware, requirePermission, requireTierAtLeast } from '../middleware/tierAuth';
import { dynamicRoleService } from '../services/dynamicRoleService';
import * as admin from 'firebase-admin';
import { db } from '../../shared/utils';
// Types are defined locally or in shared-firebase-functions/shared/types.ts
// import { 
//   TeamMemberRole, 
//   RoleTemplate, 
//   DynamicRole,
//   ProjectAssignment 
// } from 'shared-types';

// ============================================================================
// DYNAMIC ROLES API ROUTES
// ============================================================================

const router: Router = Router();

// Handle OPTIONS preflight requests for CORS
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Max-Age', '3600');
    return res.status(204).send();
  }
  next();
});

// Apply authentication to all routes
router.use(enhancedAuthMiddleware);

/**
 * GET /organizations/:orgId/roles
 * Get all roles for an organization
 */
router.get('/organizations/:orgId/roles',
  requirePermission('userManagement', 'view_user_activity'),
  async (req, res) => {
    console.log('🔍 [dynamicRoles] GET /organizations/:orgId/roles hit', { orgId: req.params.orgId, path: req.path, originalUrl: req.originalUrl });
    // Set CORS headers
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

    try {
      const { orgId } = req.params;

      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      const roles = await dynamicRoleService.getRoles(orgId as string);

      return res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      console.error('Error getting organization roles:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get organization roles',
        errorDetails: error.message
      });
    }
  }
);

/**
 * POST /organizations/:orgId/roles
 * Create a new role for an organization
 */
router.post('/organizations/:orgId/roles',
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    // Set CORS headers
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

    try {
      const { orgId } = req.params;
      const { name, displayName, description, category, hierarchy, permissions, appRoles } = req.body;

      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Validate required fields (hierarchy is now optional)
      if (!name || !displayName || !category) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, displayName, and category are required'
        });
      }

      const roleData = {
        name,
        description: description || '',
        permissions: permissions || [],
        tier: ((req.user as any)?.tier || 'BASIC') as 'BASIC' | 'PRO' | 'ENTERPRISE',
        hierarchy: hierarchy, // Optional - for backward compatibility
        organizationId: orgId,
        appRoles: appRoles || {} // NEW: App-specific role mappings
      };

      const newRole = await dynamicRoleService.createRole(roleData, req.user?.uid || 'system');

      return res.status(201).json({
        success: true,
        data: newRole,
        message: 'Role created successfully'
      });
    } catch (error: any) {
      console.error('Error creating role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * PUT /organizations/:orgId/roles/:roleId
 * Update an existing role
 */
router.put('/organizations/:orgId/roles/:roleId',
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    try {
      const { orgId, roleId } = req.params;
      const updates = req.body;

      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      const updatedRole = await dynamicRoleService.updateRole(roleId as string, updates);

      return res.json({
        success: true,
        data: updatedRole,
        message: 'Role updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * DELETE /organizations/:orgId/roles/:roleId
 * Soft delete a role (mark as inactive)
 */
router.delete('/organizations/:orgId/roles/:roleId',
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    try {
      const { orgId, roleId } = req.params;

      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Soft delete by marking as inactive
      const success = await dynamicRoleService.deleteRole(roleId as string);
      if (!success) {
        throw new Error('Failed to delete role');
      }
      const updatedRole = await dynamicRoleService.getRoleById(roleId as string);

      return res.json({
        success: true,
        data: updatedRole,
        message: 'Role deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * GET /roles/:roleId/permissions
 * Get role permissions filtered by user's tier
 */
router.get('/roles/:roleId/permissions', async (req, res) => {
  try {
    const { roleId } = req.params;
    const userTier = (req.user as any)?.tier || 'BASIC';

    const role = await dynamicRoleService.getRoleWithTierFiltering(roleId as string, userTier);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    return res.json({
      success: true,
      data: {
        roleId: role.id,
        roleName: role.name,
        permissions: role.permissions,
        tier: userTier
      }
    });
  } catch (error: any) {
    console.error('Error getting role permissions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get role permissions',
      errorDetails: error.message
    });
  }
});

/**
 * PUT /projects/:projectId/team-members/:teamMemberId/role
 * Assign a role to a team member in a project
 */
router.put('/projects/:projectId/team-members/:teamMemberId/role',
  requirePermission('userManagement', 'assign_permissions'),
  async (req, res) => {
    try {
      const { projectId, teamMemberId } = req.params;
      const { roleId, appRoles } = req.body; // appRoles can override role's default appRoles

      if (!roleId) {
        return res.status(400).json({
          success: false,
          error: 'Role ID is required'
        });
      }

      // Get the role to verify it exists and belongs to the organization
      const role = await dynamicRoleService.getRoleWithTierFiltering(roleId as string, (req.user as any)?.tier || 'BASIC');

      if (!role) {
        return res.status(404).json({
          success: false,
          error: 'Role not found or access denied'
        });
      }

      // Verify role belongs to user's organization
      if (role.organizationId !== req.user?.organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Role does not belong to your organization'
        });
      }

      // Use provided appRoles if available, otherwise use role's default appRoles
      const finalAppRoles = appRoles && Object.keys(appRoles).length > 0
        ? appRoles
        : (role.appRoles || {});

      // Update team member's role assignment
      const assignmentData = {
        teamMemberId: teamMemberId as string,
        projectId: projectId as string,
        roleId: roleId as string,
        roleName: role.name,
        hierarchy: role.hierarchy, // Optional - for backward compatibility
        permissions: role.permissions,
        appRoles: finalAppRoles, // Use provided appRoles or role's default
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedBy: req.user?.uid,
        organizationId: req.user?.organizationId
      };

      // Update or create project team member assignment
      const assignmentRef = db.collection('projectTeamMembers').doc(`${projectId}_${teamMemberId}`);
      await assignmentRef.set(assignmentData, { merge: true });

      // Update team member's custom claims for immediate effect
      try {
        const customClaims: any = {
          organizationId: req.user?.organizationId,
          tier: (req.user as any)?.tier || 'BASIC',
          customRoleId: roleId,
          roleName: role.name,
          permissions: role.permissions,
          projectAssignments: {
            [projectId as string]: {
              roleId,
              roleName: role.name,
              assignedAt: new Date().toISOString()
            }
          }
        };

        // Include hierarchy only if it exists (backward compatibility)
        if (role.hierarchy !== undefined) {
          customClaims.hierarchy = role.hierarchy;
          customClaims.projectAssignments[projectId as string].hierarchy = role.hierarchy;
        }

        // Include app roles (use finalAppRoles which may be overridden)
        if (finalAppRoles) {
          if (finalAppRoles.dashboardRole) {
            customClaims.dashboardRole = finalAppRoles.dashboardRole;
          }
          if (finalAppRoles.clipShowProRole) {
            customClaims.clipShowProRole = finalAppRoles.clipShowProRole;
          }
          if (finalAppRoles.callSheetRole) {
            customClaims.callSheetRole = finalAppRoles.callSheetRole;
          }
          if (finalAppRoles.cuesheetRole) {
            customClaims.cuesheetRole = finalAppRoles.cuesheetRole;
          }
        }

        await admin.auth().setCustomUserClaims(teamMemberId as string, customClaims);
        console.log(`✅ Updated custom claims for team member: ${teamMemberId}`);
      } catch (claimsError) {
        console.warn('Failed to update custom claims:', claimsError);
        // Don't fail the request if claims update fails
      }

      return res.json({
        success: true,
        data: assignmentData,
        message: 'Role assigned successfully'
      });
    } catch (error: any) {
      console.error('Error assigning role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to assign role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * POST /organizations/:orgId/roles/default
 * Create default roles for a new organization
 */
router.post('/organizations/:orgId/roles/default',
  requireTierAtLeast('PRO'),
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    try {
      const { orgId } = req.params;

      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Check if organization already has roles
      const existingRoles = await dynamicRoleService.getRoles(orgId as string);
      if (existingRoles.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Organization already has roles defined'
        });
      }

      // Create default roles manually since the service doesn't have createDefaultRoles method
      // Note: Default roles now use appRoles instead of hierarchy
      const defaultRoles = await createDefaultRolesForOrganization(orgId as string, req.user?.uid || 'system');

      return res.status(201).json({
        success: true,
        data: defaultRoles,
        message: `Created ${defaultRoles.length} default roles`
      });
    } catch (error: any) {
      console.error('Error creating default roles:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create default roles',
        errorDetails: error.message
      });
    }
  }
);

/**
 * GET /feature-access/:feature
 * Check if user has access to a specific feature
 */
router.get('/feature-access/:feature', async (req, res) => {
  try {
    const { feature } = req.params;
    const userTier = (req.user as any)?.tier || 'BASIC';

    const hasAccess = dynamicRoleService.hasFeatureAccess(userTier, feature);

    return res.json({
      success: true,
      data: {
        feature,
        hasAccess,
        userTier,
        upgradeRequired: !hasAccess
      }
    });
  } catch (error: any) {
    console.error('Error checking feature access:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check feature access',
      errorDetails: error.message
    });
  }
});

/**
 * GET /permission-check/:feature/:action
 * Check if user has a specific permission
 */
router.get('/permission-check/:feature/:action', async (req, res) => {
  try {
    const { feature, action } = req.params;
    const userTier = (req.user as any)?.tier || 'BASIC';
    const userPermissions = (req.user as any)?.permissions || {};

    const hasPermission = dynamicRoleService.hasPermission(userPermissions, action);
    const hasFeatureAccess = dynamicRoleService.hasFeatureAccess(userTier, feature);

    return res.json({
      success: true,
      data: {
        feature,
        action,
        hasPermission,
        hasFeatureAccess,
        userTier,
        upgradeRequired: !hasFeatureAccess
      }
    });
  } catch (error: any) {
    console.error('Error checking permission:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check permission',
      errorDetails: error.message
    });
  }
});

/**
 * Helper function to create default roles for a new organization
 */
async function createDefaultRolesForOrganization(organizationId: string, createdBy: string) {
  const defaultRoles = [
    {
      name: 'Admin',
      description: 'Full administrative access',
      permissions: ['admin', 'manage_users', 'manage_roles', 'manage_projects'],
      tier: 'ENTERPRISE' as const,
      hierarchy: 100, // Kept for backward compatibility
      organizationId,
      appRoles: {
        dashboardRole: 'ADMIN',
        clipShowProRole: 'ADMIN',
        callSheetRole: 'ADMIN',
        cuesheetRole: 'ADMIN'
      }
    },
    {
      name: 'Manager',
      description: 'Project management and team coordination',
      permissions: ['manage_projects', 'manage_team', 'view_reports'],
      tier: 'PRO' as const,
      hierarchy: 80, // Kept for backward compatibility
      organizationId,
      appRoles: {
        dashboardRole: 'MANAGER',
        clipShowProRole: 'PRODUCER',
        callSheetRole: 'PRODUCER',
        cuesheetRole: 'PRODUCER'
      }
    },
    {
      name: 'Member',
      description: 'Standard team member access',
      permissions: ['view_projects', 'edit_content', 'view_reports'],
      tier: 'BASIC' as const,
      hierarchy: 50, // Kept for backward compatibility
      organizationId,
      appRoles: {
        dashboardRole: 'EDITOR',
        clipShowProRole: 'EDITOR',
        callSheetRole: 'MEMBER',
        cuesheetRole: 'EDITOR'
      }
    },
    {
      name: 'Viewer',
      description: 'Read-only access to projects',
      permissions: ['view_projects', 'view_reports'],
      tier: 'BASIC' as const,
      hierarchy: 25, // Kept for backward compatibility
      organizationId,
      appRoles: {
        dashboardRole: 'VIEWER',
        clipShowProRole: 'VIEWER',
        callSheetRole: 'MEMBER',
        cuesheetRole: 'VIEWER'
      }
    }
  ];

  const createdRoles = [];
  for (const roleData of defaultRoles) {
    const role = await dynamicRoleService.createRole(roleData, createdBy);
    createdRoles.push(role);
  }

  return createdRoles;
}

// Debug route to verify router is working
router.get('/test', (req, res) => {
  console.log('✅ [dynamicRoles] Test route hit');
  res.json({ success: true, message: 'Dynamic roles router is working', path: req.path, originalUrl: req.originalUrl });
});

export default router;

