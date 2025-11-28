/**
 * Remove Team Member from Project Function
 * 
 * Removes a team member from a specific project
 */

import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const removeTeamMemberFromProject = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: any, res: any): Promise<void> => {
    try {
      const { teamMemberId, projectId, organizationId, removedBy } = req.body;

      if (!teamMemberId) {
        res.status(400).json(createErrorResponse('Team member ID is required'));
        return;
      }

      if (!projectId) {
        res.status(400).json(createErrorResponse('Project ID is required'));
        return;
      }

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`👥 [REMOVE FROM PROJECT] Removing team member ${teamMemberId} from project ${projectId}`);

      // Verify team member exists
      const teamMemberDoc = await db.collection('teamMembers').doc(teamMemberId).get();
      if (!teamMemberDoc.exists) {
        res.status(404).json(createErrorResponse('Team member not found'));
        return;
      }

      const teamMemberData = teamMemberDoc.data();
      if (teamMemberData?.organizationId !== organizationId) {
        res.status(403).json(createErrorResponse('Team member not in organization'));
        return;
      }

      // Verify project exists
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        res.status(404).json(createErrorResponse('Project not found'));
        return;
      }

      const projectData = projectDoc.data();
      if (projectData?.organizationId !== organizationId) {
        res.status(403).json(createErrorResponse('Project not in organization'));
        return;
      }

      // Check if team member is assigned to project
      const existingAssignments = teamMemberData?.projectAssignments || {};
      if (!existingAssignments[projectId]) {
        res.status(400).json(createErrorResponse('Team member not assigned to project'));
        return;
      }

      // Remove project assignment from team member
      const updatedAssignments = { ...existingAssignments };
      delete updatedAssignments[projectId];

      await db.collection('teamMembers').doc(teamMemberId).update({
        projectAssignments: updatedAssignments,
        updatedAt: new Date()
      });

      // Remove team member from project's team list
      const projectTeamMembers = projectData?.teamMembers || [];
      const updatedTeamMembers = projectTeamMembers.filter((id: any) => id !== teamMemberId);

      await db.collection('projects').doc(projectId).update({
        teamMembers: updatedTeamMembers,
        updatedAt: new Date()
      });

      console.log(`👥 [REMOVE FROM PROJECT] Successfully removed team member ${teamMemberId} from project ${projectId}`);

      res.status(200).json(createSuccessResponse({
        teamMemberId,
        projectId,
        organizationId,
        removedAt: new Date().toISOString(),
        removedBy: removedBy || 'system'
      }, 'Team member removed from project successfully'));

    } catch (error: any) {
      console.error('❌ [REMOVE FROM PROJECT] Error:', error);
      res.status(500).json(handleError(error, 'removeTeamMemberFromProject'));
    }
  }
);
