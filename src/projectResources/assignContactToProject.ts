/**
 * Assign Contact to Project Function
 * 
 * Assigns a contact (user) to a project for selective access
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { canAssignResourcesToProject } from '../shared/projectPermissions';
import * as admin from 'firebase-admin';

export const assignContactToProject = onCall(
  {
    cors: true,
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { projectId, contactUserId, role, notes } = request.data;

      if (!projectId || !contactUserId) {
        throw new HttpsError('invalid-argument', 'Project ID and Contact User ID are required');
      }

      const userId = request.auth.uid;

      // Get project to verify organization
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        throw new HttpsError('not-found', 'Project not found');
      }

      const projectData = projectDoc.data();
      const organizationId = projectData?.organizationId;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Project must have an organization ID');
      }

      // Verify user has permission to assign resources
      const canAssign = await canAssignResourcesToProject(userId, projectId);
      if (!canAssign) {
        throw new HttpsError('permission-denied', 'You do not have permission to assign contacts to this project');
      }

      // Verify contact user exists and belongs to organization
      const contactDoc = await db.collection('users').doc(contactUserId).get();
      if (!contactDoc.exists) {
        throw new HttpsError('not-found', 'Contact user not found');
      }

      const contactData = contactDoc.data();
      if (contactData?.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'Contact must belong to the same organization as the project');
      }

      // Check if assignment already exists
      const existingAssignmentQuery = await db.collection('projectContactAssignments')
        .where('projectId', '==', projectId)
        .where('contactUserId', '==', contactUserId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!existingAssignmentQuery.empty) {
        throw new HttpsError('already-exists', 'Contact is already assigned to this project');
      }

      // Create assignment document
      const assignmentData = {
        projectId,
        organizationId,
        contactUserId,
        assignedBy: userId,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        role: role || null,
        notes: notes || null,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const assignmentRef = await db.collection('projectContactAssignments').add(assignmentData);

      console.log(`✅ [PROJECT CONTACTS] Assigned contact ${contactUserId} to project ${projectId}`);

      return {
        success: true,
        data: {
          assignmentId: assignmentRef.id,
          ...assignmentData,
        },
        message: 'Contact assigned to project successfully',
      };
    } catch (error: any) {
      console.error('❌ [PROJECT CONTACTS] Error assigning contact:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to assign contact to project');
    }
  }
);

