/**
 * Remove Team Member from Project Function
 * 
 * Removes a team member from a specific project
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const removeTeamMemberFromProject = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res) => {
    try {
      const { teamMemberId, projectId, organizationId, removedBy } = req.body;

      if (!teamMemberId) {
        return res.status(400).json(createErrorResponse('Team member ID is required'));
      }

      if (!projectId) {
        return res.status(400).json(createErrorResponse('Project ID is required'));
      }

      if (!organizationId) {
        return res.status(400).json(createErrorResponse('Organization ID is required'));
      }

      console.log(`👥 [REMOVE FROM PROJECT] Removing team member ${teamMemberId} from project ${projectId}`);

      // Verify team member exists
      const teamMemberDoc = await db.collection('teamMembers').doc(teamMemberId).get();
      if (!teamMemberDoc.exists) {
        return res.status(404).json(createErrorResponse('Team member not found'));
      }

      const teamMemberData = teamMemberDoc.data();
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

      // Check if team member is assigned to project
      const existingAssignments = teamMemberData.projectAssignments || {};
      if (!existingAssignments[projectId]) {
        return res.status(400).json(createErrorResponse('Team member not assigned to project'));
      }

      // Remove project assignment from team member
      const updatedAssignments = { ...existingAssignments };
      delete updatedAssignments[projectId];

      await db.collection('teamMembers').doc(teamMemberId).update({
        projectAssignments: updatedAssignments,
        updatedAt: new Date()
      });

      // Remove team member from project's team list
      const projectTeamMembers = projectData.teamMembers || [];
      const updatedTeamMembers = projectTeamMembers.filter(id => id !== teamMemberId);

      await db.collection('projects').doc(projectId).update({
        teamMembers: updatedTeamMembers,
        updatedAt: new Date()
      });

      console.log(`👥 [REMOVE FROM PROJECT] Successfully removed team member ${teamMemberId} from project ${projectId}`);

      return res.status(200).json(createSuccessResponse({
        teamMemberId,
        projectId,
        organizationId,
        removedAt: new Date(),
        removedBy: removedBy || 'system'
      }, 'Team member removed from project successfully'));

    } catch (error: any) {
      console.error('❌ [REMOVE FROM PROJECT] Error:', error);
      return res.status(500).json(handleError(error, 'removeTeamMemberFromProject'));
    }
  }
);
