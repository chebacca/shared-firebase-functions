/**
 * 🔥 UNIFIED APP ROLE DEFINITIONS HTTP ENDPOINT
 * 
 * Provides a unified HTTP API for all projects to fetch app role definitions
 * This replaces duplicate implementations across projects
 */

import * as functions from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { appRoleDefinitionService } from './AppRoleDefinitionService';

// Type definitions (matching AppRoleDefinitionService)
type AppNameType = 
  | 'hub'           // Backbone Hub
  | 'pws'           // Production Workflow System (dashboard)
  | 'dashboard'     // Legacy alias for pws
  | 'clipShowPro'   // Clip Show Pro
  | 'callSheet'     // Call Sheet Pro
  | 'cuesheet'      // Cuesheet & Budget Tools
  | 'iwm'           // Inventory & Warehouse Management
  | 'timecard'      // Timecard Management
  | 'securityDesk'  // Security Desk
  | 'addressBook'   // Address Book
  | 'deliverables'  // Deliverables
  | 'cns';          // CNS / Parser Brain

// Express app for app role definitions API
const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'https://clipshowpro.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001', // Production Workflow System (Dashboard)
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4004',
    'http://localhost:4005',
    'http://localhost:4006',
    'http://localhost:4007',
    'http://localhost:4010',
    'http://localhost:4011',
    'http://localhost:5173',
    'http://localhost:5200', // Hub Web
    'http://localhost:5300'  // Hub Web
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());

/**
 * Middleware to verify Firebase Auth token
 */
const authenticateFirebaseToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[appRoleDefinitionsApi] Missing or invalid authorization header', {
        hasHeader: !!authHeader,
        headerPrefix: authHeader?.substring(0, 20)
      });
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        errorDetails: 'Authorization header must be in format: Bearer <token>'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    if (!token || token.trim().length === 0) {
      console.error('[appRoleDefinitionsApi] Empty token after Bearer prefix');
      return res.status(401).json({
        success: false,
        error: 'Empty authorization token',
        errorDetails: 'Token is required after Bearer prefix'
      });
    }

    const admin = await import('firebase-admin');

    if (!admin.apps.length) {
      admin.initializeApp();
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Extract organizationId from claims (could be in different places)
    const organizationId = decodedToken.organizationId 
      || decodedToken.orgId 
      || (decodedToken as any).organization_id
      || null;

    (req as any).user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      organizationId: organizationId
    };

    console.log('[appRoleDefinitionsApi] Token verified successfully', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      hasOrganizationId: !!organizationId,
      organizationId: organizationId
    });

    next();
  } catch (error: any) {
    console.error('[appRoleDefinitionsApi] Authentication error:', {
      error: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 200)
    });
    
    // Provide more specific error messages
    let errorMessage = 'Invalid or expired token';
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Token has expired. Please refresh your session.';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid token format.';
    } else if (error.code === 'auth/id-token-revoked') {
      errorMessage = 'Token has been revoked. Please sign in again.';
    }
    
    return res.status(401).json({
      success: false,
      error: errorMessage,
      errorDetails: error.message,
      errorCode: error.code
    });
  }
};

/**
 * GET /organizations/:orgId/app-roles/:appName
 * Get all available app roles (system defaults + organization custom) for an app
 */
app.get('/organizations/:orgId/app-roles/:appName', authenticateFirebaseToken, async (req, res) => {
  try {
    const { orgId, appName } = req.params;
    const user = (req as any).user;

    // Validate appName
    const validAppNames: AppNameType[] = [
      'hub', 'pws', 'dashboard', 'clipShowPro', 'callSheet', 'cuesheet',
      'iwm', 'timecard', 'securityDesk', 'addressBook', 'deliverables', 'cns'
    ];
    if (!validAppNames.includes(appName as AppNameType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
      });
    }

    // Verify user has access to this organization
    // Check if user's organizationId matches or if they have access via teamMembers
    if (user.organizationId !== orgId) {
      // Check teamMembers collection as fallback
      const admin = await import('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp();
      }
      const db = admin.firestore();

      const teamMemberQuery = await db.collection('teamMembers')
        .where('userId', '==', user.uid)
        .where('organizationId', '==', orgId)
        .limit(1)
        .get();

      if (teamMemberQuery.empty) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this organization'
        });
      }
    }

    const roles = await appRoleDefinitionService.getAvailableAppRoles(orgId as string, appName as AppNameType);

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
});

/**
 * GET /app-roles/system-defaults/:appName
 * Get system default app roles only (read-only, no auth required)
 */
app.get('/app-roles/system-defaults/:appName', async (req, res) => {
  try {
    const { appName } = req.params;

    // Validate appName
    const validAppNames: AppNameType[] = [
      'hub', 'pws', 'dashboard', 'clipShowPro', 'callSheet', 'cuesheet',
      'iwm', 'timecard', 'securityDesk', 'addressBook', 'deliverables', 'cns'
    ];
    if (!validAppNames.includes(appName as AppNameType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
      });
    }

    const roles = await appRoleDefinitionService.getSystemDefaults(appName as string as AppNameType);

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
});

/**
 * POST /organizations/:orgId/app-roles/:appName
 * Create a new custom app role definition
 */
app.post('/organizations/:orgId/app-roles/:appName', authenticateFirebaseToken, async (req, res) => {
  try {
    const { orgId, appName } = req.params;
    const { roleValue, displayName, description, permissions, hierarchy, equivalentEnum } = req.body;
    const user = (req as any).user;

    // Validate appName
    const validAppNames: AppNameType[] = [
      'hub', 'pws', 'dashboard', 'clipShowPro', 'callSheet', 'cuesheet',
      'iwm', 'timecard', 'securityDesk', 'addressBook', 'deliverables', 'cns'
    ];
    if (!validAppNames.includes(appName as AppNameType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
      });
    }

    // Verify user has access to this organization
    if (user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
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
      orgId as string,
      appName as string as AppNameType,
      {
        roleValue,
        displayName,
        description,
        permissions,
        hierarchy,
        equivalentEnum
      },
      user.uid || 'system'
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
});

/**
 * PUT /organizations/:orgId/app-roles/:appName/:roleId
 * Update an existing custom app role definition
 */
app.put('/organizations/:orgId/app-roles/:appName/:roleId', authenticateFirebaseToken, async (req, res) => {
  try {
    const { orgId, appName, roleId } = req.params;
    const updates = req.body;
    const user = (req as any).user;

    // Validate appName
    const validAppNames: AppNameType[] = [
      'hub', 'pws', 'dashboard', 'clipShowPro', 'callSheet', 'cuesheet',
      'iwm', 'timecard', 'securityDesk', 'addressBook', 'deliverables', 'cns'
    ];
    if (!validAppNames.includes(appName as AppNameType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
      });
    }

    // Verify user has access to this organization
    if (user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    const updatedRole = await appRoleDefinitionService.updateCustomAppRole(
      orgId as string,
      appName as string as AppNameType,
      roleId as string,
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
});

/**
 * DELETE /organizations/:orgId/app-roles/:appName/:roleId
 * Soft delete a custom app role definition
 */
app.delete('/organizations/:orgId/app-roles/:appName/:roleId', authenticateFirebaseToken, async (req, res) => {
  try {
    const { orgId, appName, roleId } = req.params;
    const user = (req as any).user;

    // Validate appName
    const validAppNames: AppNameType[] = [
      'hub', 'pws', 'dashboard', 'clipShowPro', 'callSheet', 'cuesheet',
      'iwm', 'timecard', 'securityDesk', 'addressBook', 'deliverables', 'cns'
    ];
    if (!validAppNames.includes(appName as AppNameType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid app name. Must be one of: ${validAppNames.join(', ')}`
      });
    }

    // Verify user has access to this organization
    if (user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    await appRoleDefinitionService.deleteCustomAppRole(
      orgId as string,
      appName as string as AppNameType,
      roleId as string
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
});

/**
 * POST /organizations/:orgId/app-roles/:appName/validate
 * Validate if a role value is valid for an organization
 */
app.post('/organizations/:orgId/app-roles/:appName/validate', authenticateFirebaseToken, async (req, res) => {
  try {
    const { orgId, appName } = req.params;
    const { roleValue } = req.body;
    const user = (req as any).user;

    // Validate appName
    const validAppNames: AppNameType[] = [
      'hub', 'pws', 'dashboard', 'clipShowPro', 'callSheet', 'cuesheet',
      'iwm', 'timecard', 'securityDesk', 'addressBook', 'deliverables', 'cns'
    ];
    if (!validAppNames.includes(appName as AppNameType)) {
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

    // Verify user has access to this organization
    if (user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    const validation = await appRoleDefinitionService.validateAppRole(
      orgId as string,
      appName as string as AppNameType,
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
});

// Export the HTTP function
export const appRoleDefinitionsApi = functions.onRequest({
  memory: '512MiB',
  timeoutSeconds: 60,
  cors: true
}, app);

