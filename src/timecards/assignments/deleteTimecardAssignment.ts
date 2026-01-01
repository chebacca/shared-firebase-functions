/**
 * Delete Timecard Assignment Function
 * 
 * Deletes a timecard assignment
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const deleteTimecardAssignment = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { assignmentId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!assignmentId) {
        throw new Error('Assignment ID is required');
      }

      console.log(`⏰ [DELETE TIMECARD ASSIGNMENT] Deleting assignment: ${assignmentId}`);

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        throw new Error('User must belong to an organization');
      }

      // Get the assignment document
      const assignmentRef = db.collection('timecardAssignments').doc(assignmentId);
      const assignmentDoc = await assignmentRef.get();

      if (!assignmentDoc.exists) {
        throw new Error('Timecard assignment not found');
      }

      const assignmentData = assignmentDoc.data();
      if (!assignmentData) {
        throw new Error('Timecard assignment data not found');
      }

      // Verify organization match
      if (assignmentData.organizationId !== organizationId) {
        throw new Error('Access denied: Assignment belongs to different organization');
      }

      // Delete the document
      await assignmentRef.delete();

      console.log(`✅ [DELETE TIMECARD ASSIGNMENT] Successfully deleted assignment: ${assignmentId}`);

      return createSuccessResponse({
        id: assignmentId,
        deleted: true
      }, 'Timecard assignment deleted successfully');

    } catch (error: any) {
      console.error('❌ [DELETE TIMECARD ASSIGNMENT] Error:', error);
      return handleError(error, 'deleteTimecardAssignment');
    }
  }
);

