/**
 * Get Available Project Roles Function
 * 
 * Returns available project roles based on user's organization role and permissions
 */

import { onRequest } from 'firebase-functions/v2/https';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Request, Response } from 'express';

export const getAvailableProjectRoles = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userRole, organizationRole, projectId } = req.body;

      if (!userRole) {
        res.status(400).json(createErrorResponse('User role is required'));
        return;
      }

      console.log(`👥 [PROJECT ROLES] Getting available roles for user role: ${userRole}`);

      // Get available roles based on user's organization role
      const availableRoles = getAvailableRolesForUser(userRole, organizationRole);

      // Get role hierarchy and permissions
      const rolesWithDetails = availableRoles.map(role => ({
        role,
        hierarchy: getRoleHierarchy(role),
        permissions: getRolePermissions(role),
        description: getRoleDescription(role),
        canManageProject: getRoleHierarchy(role) >= 70,
        canAssignTasks: getRoleHierarchy(role) >= 60,
        canEditProject: getRoleHierarchy(role) >= 50,
        canViewProject: getRoleHierarchy(role) >= 10
      }));

      // Sort by hierarchy (highest first)
      rolesWithDetails.sort((a, b) => b.hierarchy - a.hierarchy);

      console.log(`👥 [PROJECT ROLES] Found ${rolesWithDetails.length} available roles`);

      res.status(200).json(createSuccessResponse({
        userRole,
        organizationRole,
        projectId,
        availableRoles: rolesWithDetails,
        count: rolesWithDetails.length
      }, 'Available project roles retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [PROJECT ROLES] Error:', error);
      res.status(500).json(handleError(error, 'getAvailableProjectRoles'));
    }
  }
);

function getAvailableRolesForUser(userRole: string, organizationRole?: string): string[] {
  // Role conversion mapping based on organization role
  const roleConversionMap: Record<string, string[]> = {
    'SUPERADMIN': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'ADMIN': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'admin': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'owner': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'MANAGER': ['POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'MEMBER': ['EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'member': ['EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'viewer': ['GUEST'],
    'USER': ['GUEST'],
    'GUEST': ['GUEST']
  };

  // Use organization role if provided, otherwise use user role
  const effectiveRole = organizationRole || userRole;
  return roleConversionMap[effectiveRole] || ['GUEST'];
}

function getRoleHierarchy(role: string): number {
  const roleHierarchy: Record<string, number> = {
    'PRODUCER': 80,
    'DIRECTOR': 80,
    'POST_PRODUCER': 70,
    'POST_COORDINATOR': 70,
    'EDITOR': 60,
    'ASSISTANT_EDITOR': 55,
    'PRODUCTION_ASSISTANT': 40,
    'POST_PA': 35,
    'GUEST': 10
  };
  
  return roleHierarchy[role] || 30;
}

function getRolePermissions(role: string): string[] {
  const rolePermissions: Record<string, string[]> = {
    'PRODUCER': ['manage:project', 'assign:tasks', 'view:all', 'edit:all', 'delete:own'],
    'DIRECTOR': ['manage:project', 'assign:tasks', 'view:all', 'edit:all', 'delete:own'],
    'POST_PRODUCER': ['manage:project', 'view:all', 'edit:all', 'delete:own'],
    'POST_COORDINATOR': ['coordinate:project', 'view:all', 'edit:assigned', 'delete:own'],
    'EDITOR': ['edit:project', 'view:all', 'delete:own'],
    'ASSISTANT_EDITOR': ['edit:assigned', 'view:all', 'delete:own'],
    'PRODUCTION_ASSISTANT': ['view:assigned', 'edit:own'],
    'POST_PA': ['view:assigned', 'edit:own'],
    'GUEST': ['view:project']
  };
  
  return rolePermissions[role] || ['view:project'];
}

function getRoleDescription(role: string): string {
  const roleDescriptions: Record<string, string> = {
    'PRODUCER': 'Overall project producer with full management capabilities',
    'DIRECTOR': 'Project director with creative and management oversight',
    'POST_PRODUCER': 'Post-production producer responsible for post workflow',
    'POST_COORDINATOR': 'Coordinates post-production activities and deliverables',
    'EDITOR': 'Video editor with full editing capabilities',
    'ASSISTANT_EDITOR': 'Assistant editor supporting main editing tasks',
    'PRODUCTION_ASSISTANT': 'Production assistant with limited project access',
    'POST_PA': 'Post-production assistant with basic project access',
    'GUEST': 'Guest user with read-only project access'
  };
  
  return roleDescriptions[role] || 'Project team member';
}
