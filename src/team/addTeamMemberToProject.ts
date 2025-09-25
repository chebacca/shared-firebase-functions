/**
 * Add Team Member to Project Function
 * 
 * Assigns a team member to a specific project with role and permissions
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const addTeamMemberToProject = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res) => {
    try {
      const { 
        teamMemberId, 
        projectId, 
        organizationId, 
        role, 
        hierarchy, 
        permissions = [],
        assignedBy 
      } = req.body;

      if (!teamMemberId) {
        return res.status(400).json(createErrorResponse('Team member ID is required'));
      }

      if (!projectId) {
        return res.status(400).json(createErrorResponse('Project ID is required'));
      }

      if (!organizationId) {
        return res.status(400).json(createErrorResponse('Organization ID is required'));
      }

      if (!role) {
        return res.status(400).json(createErrorResponse('Role is required'));
      }

      console.log(`👥 [ADD TO PROJECT] Adding team member ${teamMemberId} to project ${projectId}`);

      // Verify team member exists and is active
      const teamMemberDoc = await db.collection('teamMembers').doc(teamMemberId).get();
      if (!teamMemberDoc.exists) {
        return res.status(404).json(createErrorResponse('Team member not found'));
      }

      const teamMemberData = teamMemberDoc.data();
      if (!teamMemberData.isActive) {
        return res.status(400).json(createErrorResponse('Team member is inactive'));
      }

      if (teamMemberData.organizationId !== organizationId) {
        return res.status(403).json(createErrorResponse('Team member not in organization'));
      }

      // Verify project exists
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        return res.status(404).json(createErrorResponse('Project not found'));
      }

      const projectData = projectDoc.data();
      if (projectData.organizationId !== organizationId) {
        return res.status(403).json(createErrorResponse('Project not in organization'));
      }

      // Check if team member is already assigned to project
      const existingAssignments = teamMemberData.projectAssignments || {};
      if (existingAssignments[projectId]) {
        return res.status(400).json(createErrorResponse('Team member already assigned to project'));
      }

      // Create project assignment
      const projectAssignment = {
        role,
        hierarchy: hierarchy || getDefaultHierarchy(role),
        permissions,
        assignedAt: new Date(),
        assignedBy: assignedBy || 'system',
        status: 'active'
      };

      // Update team member with project assignment
      await db.collection('teamMembers').doc(teamMemberId).update({
        [`projectAssignments.${projectId}`]: projectAssignment,
        updatedAt: new Date()
      });

      // Add team member to project's team list
      const projectTeamMembers = projectData.teamMembers || [];
      if (!projectTeamMembers.includes(teamMemberId)) {
        await db.collection('projects').doc(projectId).update({
          teamMembers: [...projectTeamMembers, teamMemberId],
          updatedAt: new Date()
        });
      }

      console.log(`👥 [ADD TO PROJECT] Successfully added team member ${teamMemberId} to project ${projectId}`);

      return res.status(200).json(createSuccessResponse({
        teamMemberId,
        projectId,
        organizationId,
        assignment: projectAssignment,
        assignedAt: new Date()
      }, 'Team member added to project successfully'));

    } catch (error: any) {
      console.error('❌ [ADD TO PROJECT] Error:', error);
      return res.status(500).json(handleError(error, 'addTeamMemberToProject'));
    }
  }
);

function getDefaultHierarchy(role: string): number {
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
  
  return roleHierarchy[role] || 50;
}
