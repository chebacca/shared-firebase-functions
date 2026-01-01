/**
 * Deactivate Direct Report Function
 * 
 * Deactivates a direct report relationship (soft delete)
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const deactivateDirectReport = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { reportId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!reportId) {
        throw new Error('Report ID is required');
      }

      console.log(`⏰ [DEACTIVATE DIRECT REPORT] Deactivating report: ${reportId}`);

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

      // Deactivate (soft delete)
      await reportRef.update({
        isActive: false,
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deactivatedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      });

      // Get updated document
      const updatedDoc = await reportRef.get();
      const updatedData = updatedDoc.data();

      console.log(`✅ [DEACTIVATE DIRECT REPORT] Successfully deactivated direct report: ${reportId}`);

      return createSuccessResponse({
        id: updatedDoc.id,
        ...updatedData
      }, 'Direct report relationship deactivated successfully');

    } catch (error: any) {
      console.error('❌ [DEACTIVATE DIRECT REPORT] Error:', error);
      return handleError(error, 'deactivateDirectReport');
    }
  }
);

