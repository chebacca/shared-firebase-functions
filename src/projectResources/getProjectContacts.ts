/**
 * Get Project Contacts Function
 * 
 * Retrieves all contacts assigned to a project
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { isProjectMember } from '../shared/projectPermissions';

export const getProjectContacts = onCall(
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

      const { projectId, includeInactive = false } = request.data;

      if (!projectId) {
        throw new HttpsError('invalid-argument', 'Project ID is required');
      }

      const userId = request.auth.uid;

      // Verify user has access to project
      const isMember = await isProjectMember(userId, projectId);
      if (!isMember) {
        throw new HttpsError('permission-denied', 'You do not have access to this project');
      }

      // Get project to verify organization
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        throw new HttpsError('not-found', 'Project not found');
      }

      // Get all active contact assignments for this project
      let assignmentsQuery = db.collection('projectContactAssignments')
        .where('projectId', '==', projectId);

      if (!includeInactive) {
        assignmentsQuery = assignmentsQuery.where('isActive', '==', true);
      }

      const assignmentsSnapshot = await assignmentsQuery.get();

      const contacts = [];

      // Fetch contact details for each assignment
      for (const assignmentDoc of assignmentsSnapshot.docs) {
        const assignmentData = assignmentDoc.data();
        const contactUserId = assignmentData.contactUserId;

        // Get user/contact details
        const contactDoc = await db.collection('users').doc(contactUserId).get();
        if (contactDoc.exists) {
          const contactData = contactDoc.data();
          contacts.push({
            assignmentId: assignmentDoc.id,
            contactId: contactUserId,
            ...contactData,
            projectRole: assignmentData.role,
            assignedAt: assignmentData.assignedAt,
            assignedBy: assignmentData.assignedBy,
            notes: assignmentData.notes,
            isActive: assignmentData.isActive,
          });
        }
      }

      console.log(`✅ [PROJECT CONTACTS] Retrieved ${contacts.length} contacts for project ${projectId}`);

      return {
        success: true,
        data: contacts,
        count: contacts.length,
        projectId,
      };
    } catch (error: any) {
      console.error('❌ [PROJECT CONTACTS] Error getting project contacts:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to get project contacts');
    }
  }
);

