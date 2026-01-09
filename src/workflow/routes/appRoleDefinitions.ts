import { Router } from 'express';
import { enhancedAuthMiddleware, requirePermission } from '../middleware/tierAuth';
// Use shared AppRoleDefinitionService from shared-firebase-functions
import { appRoleDefinitionService } from '../../roles/AppRoleDefinitionService';

// AppName type definition (inline since shared-firebase-models may not be available)
type AppName = 'dashboard' | 'clipShowPro' | 'callSheet' | 'cuesheet';

const router = Router();

// Apply authentication to all routes
router.use(enhancedAuthMiddleware);

/**
 * GET /organizations/:orgId/app-roles/:appName
 * Get all available app roles (system defaults + organization custom) for an app
 */
router.get('/organizations/:orgId/app-roles/:appName',
  requirePermission('userManagement', 'view_user_activity'),
  async (req, res) => {
    try {
      const { orgId, appName } = req.params;
      
      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Validate appName
      const validAppNames: AppName[] = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet'];
      if (!validAppNames.includes(appName as AppName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
        });
      }

      const roles = await appRoleDefinitionService.getAvailableAppRoles(orgId, appName as AppName);
      
      return res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      console.error('Error getting app roles:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get app roles',
        errorDetails: error.message
      });
    }
  }
);

/**
 * GET /app-roles/system-defaults/:appName
 * Get system default app roles only (read-only)
 */
router.get('/app-roles/system-defaults/:appName',
  async (req, res) => {
    try {
      const { appName } = req.params;

      // Validate appName
      const validAppNames: AppName[] = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet'];
      if (!validAppNames.includes(appName as AppName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
        });
      }

      const roles = await appRoleDefinitionService.getSystemDefaults(appName as AppName);
      
      return res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      console.error('Error getting system default app roles:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get system default app roles',
        errorDetails: error.message
      });
    }
  }
);

/**
 * POST /organizations/:orgId/app-roles/:appName
 * Create a new custom app role definition
 */
router.post('/organizations/:orgId/app-roles/:appName',
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    try {
      const { orgId, appName } = req.params;
      const { roleValue, displayName, description, permissions, hierarchy } = req.body;
      
      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Validate appName
      const validAppNames: AppName[] = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet'];
      if (!validAppNames.includes(appName as AppName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
        });
      }

      // Validate required fields
      if (!roleValue || !displayName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: roleValue and displayName are required'
        });
      }

      const newRole = await appRoleDefinitionService.createCustomAppRole(
        orgId,
        appName as AppName,
        {
          roleValue,
          displayName,
          description,
          permissions,
          hierarchy
        },
        req.user?.uid || 'system'
      );
      
      return res.status(201).json({
        success: true,
        data: newRole,
        message: 'Custom app role created successfully'
      });
    } catch (error: any) {
      console.error('Error creating custom app role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create custom app role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * PUT /organizations/:orgId/app-roles/:appName/:roleId
 * Update an existing custom app role definition
 */
router.put('/organizations/:orgId/app-roles/:appName/:roleId',
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    try {
      const { orgId, appName, roleId } = req.params;
      const updates = req.body;
      
      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Validate appName
      const validAppNames: AppName[] = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet'];
      if (!validAppNames.includes(appName as AppName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
        });
      }

      const updatedRole = await appRoleDefinitionService.updateCustomAppRole(
        orgId,
        appName as AppName,
        roleId,
        updates
      );
      
      return res.json({
        success: true,
        data: updatedRole,
        message: 'Custom app role updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating custom app role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update custom app role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * DELETE /organizations/:orgId/app-roles/:appName/:roleId
 * Soft delete a custom app role definition
 */
router.delete('/organizations/:orgId/app-roles/:appName/:roleId',
  requirePermission('userManagement', 'manage_roles'),
  async (req, res) => {
    try {
      const { orgId, appName, roleId } = req.params;
      
      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Validate appName
      const validAppNames: AppName[] = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet'];
      if (!validAppNames.includes(appName as AppName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
        });
      }

      await appRoleDefinitionService.deleteCustomAppRole(
        orgId,
        appName as AppName,
        roleId
      );
      
      return res.json({
        success: true,
        message: 'Custom app role deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting custom app role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete custom app role',
        errorDetails: error.message
      });
    }
  }
);

/**
 * POST /organizations/:orgId/app-roles/:appName/validate
 * Validate if a role value is valid for an organization
 */
router.post('/organizations/:orgId/app-roles/:appName/validate',
  async (req, res) => {
    try {
      const { orgId, appName } = req.params;
      const { roleValue } = req.body;
      
      // Verify user belongs to this organization
      if (req.user?.organizationId !== orgId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }

      // Validate appName
      const validAppNames: AppName[] = ['dashboard', 'clipShowPro', 'callSheet', 'cuesheet'];
      if (!validAppNames.includes(appName as AppName)) {
        return res.status(400).json({
          success: false,
          error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
        });
      }

      if (!roleValue) {
        return res.status(400).json({
          success: false,
          error: 'roleValue is required'
        });
      }

      const validation = await appRoleDefinitionService.validateAppRole(
        orgId,
        appName as AppName,
        roleValue
      );
      
      return res.json({
        success: true,
        data: validation
      });
    } catch (error: any) {
      console.error('Error validating app role:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to validate app role',
        errorDetails: error.message
      });
    }
  }
);

export default router;

