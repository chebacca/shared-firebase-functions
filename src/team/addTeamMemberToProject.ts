/**
 * Add Team Member to Project Function
 * 
 * Assigns a team member to a specific project with role and permissions
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Request, Response } from 'express';

const db = getFirestore();

export const addTeamMemberToProject = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: Request, res: Response) => {
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

      if (!role) {
        res.status(400).json(createErrorResponse('Role is required'));
        return;
      }

      console.log(`👥 [ADD TO PROJECT] Adding team member ${teamMemberId} to project ${projectId}`);

      // Verify team member exists and is active
      const teamMemberDoc = await db.collection('teamMembers').doc(teamMemberId).get();
      if (!teamMemberDoc.exists) {
        res.status(404).json(createErrorResponse('Team member not found'));
        return;
      }

      const teamMemberData = teamMemberDoc.data();
      if (!teamMemberData?.isActive) {
        res.status(400).json(createErrorResponse('Team member is inactive'));
        return;
      }

      if (teamMemberData.organizationId !== organizationId) {
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

      // Check if team member is already assigned to project
      const existingAssignments = teamMemberData.projectAssignments || {};
      if (existingAssignments[projectId]) {
        res.status(400).json(createErrorResponse('Team member already assigned to project'));
        return;
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
      const projectTeamMembers = projectData?.teamMembers || [];
      if (!projectTeamMembers.includes(teamMemberId)) {
        await db.collection('projects').doc(projectId).update({
          teamMembers: [...projectTeamMembers, teamMemberId],
          updatedAt: new Date()
        });
      }

      console.log(`👥 [ADD TO PROJECT] Successfully added team member ${teamMemberId} to project ${projectId}`);

      res.status(200).json(createSuccessResponse({
        teamMemberId,
        projectId,
        organizationId,
        assignment: projectAssignment,
        assignedAt: new Date().toISOString()
      }, 'Team member added to project successfully'));

    } catch (error: any) {
      console.error('❌ [ADD TO PROJECT] Error:', error);
      res.status(500).json(handleError(error, 'addTeamMemberToProject'));
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
