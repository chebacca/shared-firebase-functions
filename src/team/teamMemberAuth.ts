/**
 * Team Member Authentication Function
 * 
 * Handles team member authentication and role verification
 */

import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
// import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();
// const auth = getAuth();

export const teamMemberAuth = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: any, res: any): Promise<void> => {
    try {
      const { userId, organizationId, projectId } = req.body;

      if (!userId) {
        res.status(400).json(createErrorResponse('User ID is required'));
        return;
      }

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`👥 [TEAM AUTH] Authenticating team member: ${userId} for org: ${organizationId}`);

      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const userData = userDoc.data();
      
      // Verify organization membership
      if (userData?.organizationId !== organizationId) {
        res.status(403).json(createErrorResponse('User not member of organization'));
        return;
      }

      // Get team member data
      const teamMemberQuery = await db.collection('teamMembers')
        .where('userId', '==', userId)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();

      if (teamMemberQuery.empty) {
        res.status(404).json(createErrorResponse('Team member record not found'));
        return;
      }

      const teamMemberData = teamMemberQuery.docs[0].data();
      
      // Check if team member is active
      if (!teamMemberData?.isActive) {
        res.status(403).json(createErrorResponse('Team member account is inactive'));
        return;
      }

      // Get project-specific role if projectId provided
      let projectRole = null;
      let projectHierarchy = 0;
      
      if (projectId) {
        const projectAssignments = teamMemberData.projectAssignments || {};
        const assignment = projectAssignments[projectId];
        
        if (assignment) {
          projectRole = assignment.role;
          projectHierarchy = assignment.hierarchy || 0;
        }
      }

      // Get effective permissions
      const permissions = getEffectivePermissions(
        userData?.role,
        teamMemberData?.role,
        projectRole
      );

      const authResult = {
        userId,
        organizationId,
        projectId,
        userRole: userData?.role,
        teamMemberRole: teamMemberData.role,
        projectRole,
        hierarchy: teamMemberData.hierarchy,
        projectHierarchy,
        permissions,
        isActive: teamMemberData.isActive,
        canManageOrganization: teamMemberData.hierarchy >= 90,
        canAccessTimecardAdmin: teamMemberData.hierarchy >= 70,
        hasProjectAccess: projectId ? !!projectRole : true,
        authenticatedAt: new Date()
      };

      console.log(`👥 [TEAM AUTH] Authentication successful for user: ${userId}`);

      res.status(200).json(createSuccessResponse(authResult, 'Team member authenticated successfully'));

    } catch (error: any) {
      console.error('❌ [TEAM AUTH] Error:', error);
      res.status(500).json(handleError(error, 'teamMemberAuth'));
    }
  }
);

function getEffectivePermissions(userRole: string, teamMemberRole: string, projectRole?: string): string[] {
  const permissions: string[] = [];
  
  // Base permissions from user role
  const userPermissions = getUserPermissions(userRole);
  permissions.push(...userPermissions);
  
  // Team member permissions
  const teamPermissions = getTeamMemberPermissions(teamMemberRole);
  permissions.push(...teamPermissions);
  
  // Project-specific permissions
  if (projectRole) {
    const projectPermissions = getProjectPermissions(projectRole);
    permissions.push(...projectPermissions);
  }
  
  // Remove duplicates
  return [...new Set(permissions)];
}

function getUserPermissions(role: string): string[] {
  const rolePermissions: Record<string, string[]> = {
    'SUPERADMIN': ['read:all', 'write:all', 'admin:all', 'delete:all'],
    'ADMIN': ['read:all', 'write:all', 'admin:users', 'admin:projects'],
    'admin': ['read:all', 'write:all', 'admin:users', 'admin:projects'],
    'owner': ['read:all', 'write:all', 'admin:all', 'delete:all'],
    'MANAGER': ['read:all', 'write:projects', 'admin:team'],
    'MEMBER': ['read:projects', 'write:own', 'view:team'],
    'member': ['read:projects', 'write:own', 'view:team'],
    'viewer': ['read:projects', 'view:team'],
    'USER': ['read:own', 'write:own'],
    'GUEST': ['read:public']
  };
  
  return rolePermissions[role] || ['read:own'];
}

function getTeamMemberPermissions(role: string): string[] {
  const teamPermissions: Record<string, string[]> = {
    'admin': ['manage:team', 'assign:projects', 'view:all'],
    'member': ['view:team', 'update:own'],
    'viewer': ['view:team']
  };
  
  return teamPermissions[role] || ['view:team'];
}

function getProjectPermissions(role: string): string[] {
  const projectPermissions: Record<string, string[]> = {
    'PRODUCER': ['manage:project', 'assign:tasks', 'view:all'],
    'DIRECTOR': ['manage:project', 'assign:tasks', 'view:all'],
    'EDITOR': ['edit:project', 'view:all'],
    'ASSISTANT_EDITOR': ['edit:project', 'view:all'],
    'POST_PRODUCER': ['manage:project', 'view:all'],
    'POST_COORDINATOR': ['coordinate:project', 'view:all'],
    'GUEST': ['view:project']
  };
  
  return projectPermissions[role] || ['view:project'];
}
