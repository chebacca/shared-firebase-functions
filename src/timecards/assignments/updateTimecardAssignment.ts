/**
 * Update Timecard Assignment Function
 * 
 * Updates a timecard assignment
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const updateTimecardAssignment = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { assignmentId, templateId, projectId, isActive } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!assignmentId) {
        throw new Error('Assignment ID is required');
      }

      console.log(`⏰ [UPDATE TIMECARD ASSIGNMENT] Updating assignment: ${assignmentId}`);

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

      // Build update data
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      };

      if (templateId !== undefined) {
        // Verify template exists
        const templateDoc = await db.collection('timecardTemplates').doc(templateId).get();
        if (!templateDoc.exists) {
          throw new Error('Timecard template not found');
        }
        updateData.templateId = templateId;
      }

      if (projectId !== undefined) {
        updateData.projectId = projectId || null;
      }

      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }

      // Update the document
      await assignmentRef.update(updateData);

      // Get updated document
      const updatedDoc = await assignmentRef.get();
      const updatedData = updatedDoc.data();

      console.log(`✅ [UPDATE TIMECARD ASSIGNMENT] Successfully updated assignment: ${assignmentId}`);

      return createSuccessResponse({
        id: updatedDoc.id,
        ...updatedData
      }, 'Timecard assignment updated successfully');

    } catch (error: any) {
      console.error('❌ [UPDATE TIMECARD ASSIGNMENT] Error:', error);
      return handleError(error, 'updateTimecardAssignment');
    }
  }
);

