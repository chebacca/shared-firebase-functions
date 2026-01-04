/**
 * Unassign Contact from Project Function
 * 
 * Removes a contact assignment from a project
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { canAssignResourcesToProject } from '../shared/projectPermissions';
import * as admin from 'firebase-admin';

export const unassignContactFromProject = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { assignmentId, projectId, contactUserId } = request.data;

      if (!assignmentId && (!projectId || !contactUserId)) {
        throw new HttpsError('invalid-argument', 'Either assignmentId or both projectId and contactUserId are required');
      }

      const userId = request.auth.uid;

      let assignmentRef;
      let assignmentDoc;

      if (assignmentId) {
        // Use assignment ID directly
        assignmentRef = db.collection('projectContactAssignments').doc(assignmentId);
        assignmentDoc = await assignmentRef.get();
      } else {
        // Find assignment by projectId and contactUserId
        const assignmentQuery = await db.collection('projectContactAssignments')
          .where('projectId', '==', projectId)
          .where('contactUserId', '==', contactUserId)
          .where('isActive', '==', true)
          .limit(1)
          .get();

        if (assignmentQuery.empty) {
          throw new HttpsError('not-found', 'Contact assignment not found');
        }

        assignmentRef = db.collection('projectContactAssignments').doc(assignmentQuery.docs[0].id);
        assignmentDoc = assignmentQuery.docs[0];
      }

      if (!assignmentDoc.exists) {
        throw new HttpsError('not-found', 'Contact assignment not found');
      }

      const assignmentData = assignmentDoc.data();
      const assignmentProjectId = assignmentData?.projectId;

      // Verify user has permission
      const canAssign = await canAssignResourcesToProject(userId, assignmentProjectId);
      if (!canAssign) {
        throw new HttpsError('permission-denied', 'You do not have permission to unassign contacts from this project');
      }

      // Deactivate assignment (soft delete)
      await assignmentRef.update({
        isActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        unassignedBy: userId,
        unassignedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ [PROJECT CONTACTS] Unassigned contact from project ${assignmentProjectId}`);

      return {
        success: true,
        message: 'Contact unassigned from project successfully',
      };
    } catch (error: any) {
      console.error('❌ [PROJECT CONTACTS] Error unassigning contact:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to unassign contact from project');
    }
  }
);

