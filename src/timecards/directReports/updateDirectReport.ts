/**
 * Update Direct Report Function
 * 
 * Updates a direct report relationship
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const updateDirectReport = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { reportId, managerId, canApproveTimecards } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!reportId) {
        throw new Error('Report ID is required');
      }

      console.log(`⏰ [UPDATE DIRECT REPORT] Updating report: ${reportId}`);

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        throw new Error('User must belong to an organization');
      }

      // Get the team member document
      const reportRef = db.collection('teamMembers').doc(reportId);
      const reportDoc = await reportRef.get();

      if (!reportDoc.exists) {
        throw new Error('Direct report relationship not found');
      }

      const reportData = reportDoc.data();
      if (!reportData) {
        throw new Error('Direct report data not found');
      }

      // Verify organization match
      if (reportData.organizationId !== organizationId) {
        throw new Error('Access denied: Direct report belongs to different organization');
      }

      // Build update data
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      };

      if (managerId !== undefined) {
        // Verify new manager exists
        const managerDoc = await db.collection('users').doc(managerId).get();
        if (!managerDoc.exists) {
          throw new Error('Manager not found');
        }
        updateData.managerId = managerId;
      }

      if (canApproveTimecards !== undefined) {
        updateData.canApproveTimecards = canApproveTimecards;
      }

      // Update the document
      await reportRef.update(updateData);

      // Get updated document
      const updatedDoc = await reportRef.get();
      const updatedData = updatedDoc.data();

      console.log(`✅ [UPDATE DIRECT REPORT] Successfully updated direct report: ${reportId}`);

      return createSuccessResponse({
        id: updatedDoc.id,
        ...updatedData
      }, 'Direct report relationship updated successfully');

    } catch (error: any) {
      console.error('❌ [UPDATE DIRECT REPORT] Error:', error);
      return handleError(error, 'updateDirectReport');
    }
  }
);

