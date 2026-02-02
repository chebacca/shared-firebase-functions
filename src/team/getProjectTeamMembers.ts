/**
 * Get Project Team Members Function
 * 
 * Retrieves team members assigned to a specific project
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

// Callable version for client-side use
export const getProjectTeamMembersCallable = onCall(
  {
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
  },
  async (request) => {
    try {
      const { projectId, organizationId, includeInactive = false } = request.data;

      if (!projectId) {
        throw new Error('Project ID is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`👥 [PROJECT TEAM] Getting team members for project: ${projectId}`);

      // Get team members assigned to the project
      let teamMembersQuery = db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('projectAssignments.' + projectId, '!=', null);

      if (!includeInactive) {
        teamMembersQuery = teamMembersQuery.where('isActive', '==', true);
      }

      const teamMembersSnapshot = await teamMembersQuery.get();
      
      const teamMembers = [];
      
      for (const doc of teamMembersSnapshot.docs) {
        const teamMemberData = doc.data();
        const projectAssignment = teamMemberData.projectAssignments?.[projectId];
        
        if (projectAssignment) {
          // Get user details
          const userDoc = await db.collection('users').doc(teamMemberData.userId).get();
          const userData = userDoc.exists ? userDoc.data() : null;
          
          teamMembers.push({
            teamMemberId: doc.id,
            userId: teamMemberData.userId,
            email: userData?.email || 'Unknown',
            displayName: userData?.displayName || 'Unknown',
            name: userData?.displayName || userData?.name || 'Unknown',
            firstName: userData?.firstName || '',
            lastName: userData?.lastName || '',
            organizationRole: teamMemberData.role,
            projectRole: projectAssignment.role,
            role: projectAssignment.role,
            hierarchy: teamMemberData.hierarchy,
            projectHierarchy: projectAssignment.hierarchy || 0,
            isActive: teamMemberData.isActive,
            assignedAt: projectAssignment.assignedAt || teamMemberData.createdAt,
            permissions: projectAssignment.permissions || [],
            canManageProject: (projectAssignment.hierarchy || 0) >= 70,
            canAssignTasks: (projectAssignment.hierarchy || 0) >= 60,
            canEditProject: (projectAssignment.hierarchy || 0) >= 50
          });
        }
      }

      // Sort by hierarchy (highest first)
      teamMembers.sort((a, b) => (b.projectHierarchy || 0) - (a.projectHierarchy || 0));

      console.log(`👥 [PROJECT TEAM] Found ${teamMembers.length} team members for project: ${projectId}`);

      return {
        success: true,
        data: teamMembers,
        count: teamMembers.length,
        projectId,
        organizationId,
        includeInactive
      };

    } catch (error: any) {
      console.error('❌ [PROJECT TEAM] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project team members',
        data: []
      };
    }
  }
);

// HTTP version (kept for backward compatibility)
export const getProjectTeamMembers = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: any, res: any): Promise<void> => {
    try {
      const { projectId, organizationId, includeInactive = false } = req.body;

      if (!projectId) {
        res.status(400).json(createErrorResponse('Project ID is required'));
        return;
      }

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`👥 [PROJECT TEAM] Getting team members for project: ${projectId}`);

      // Get team members assigned to the project
      let teamMembersQuery = db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('projectAssignments.' + projectId, '!=', null);

      if (!includeInactive) {
        teamMembersQuery = teamMembersQuery.where('isActive', '==', true);
      }

      const teamMembersSnapshot = await teamMembersQuery.get();
      
      const teamMembers = [];
      
      for (const doc of teamMembersSnapshot.docs) {
        const teamMemberData = doc.data();
        const projectAssignment = teamMemberData.projectAssignments?.[projectId];
        
        if (projectAssignment) {
          // Get user details
          const userDoc = await db.collection('users').doc(teamMemberData.userId).get();
          const userData = userDoc.exists ? userDoc.data() : null;
          
          teamMembers.push({
            teamMemberId: doc.id,
            userId: teamMemberData.userId,
            email: userData?.email || 'Unknown',
            displayName: userData?.displayName || 'Unknown',
            organizationRole: teamMemberData.role,
            projectRole: projectAssignment.role,
            hierarchy: teamMemberData.hierarchy,
            projectHierarchy: projectAssignment.hierarchy || 0,
            isActive: teamMemberData.isActive,
            assignedAt: projectAssignment.assignedAt || teamMemberData.createdAt,
            permissions: projectAssignment.permissions || [],
            canManageProject: (projectAssignment.hierarchy || 0) >= 70,
            canAssignTasks: (projectAssignment.hierarchy || 0) >= 60,
            canEditProject: (projectAssignment.hierarchy || 0) >= 50
          });
        }
      }

      // Sort by hierarchy (highest first)
      teamMembers.sort((a, b) => (b.projectHierarchy || 0) - (a.projectHierarchy || 0));

      console.log(`👥 [PROJECT TEAM] Found ${teamMembers.length} team members for project: ${projectId}`);

      res.status(200).json(createSuccessResponse({
        projectId,
        organizationId,
        teamMembers,
        count: teamMembers.length,
        includeInactive
      }, 'Project team members retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [PROJECT TEAM] Error:', error);
      res.status(500).json(handleError(error, 'getProjectTeamMembers'));
    }
  }
);
