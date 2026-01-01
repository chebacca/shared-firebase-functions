/**
 * Bulk Approve Timecards Function
 * 
 * Approves multiple timecards at once
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const bulkApproveTimecards = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true
  },
  async (request) => {
    try {
      const { timecardIds, comments } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!timecardIds || !Array.isArray(timecardIds) || timecardIds.length === 0) {
        throw new Error('Timecard IDs array is required');
      }

      console.log(`⏰ [BULK APPROVE TIMECARDS] Approving ${timecardIds.length} timecards by user: ${userId}`);

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        throw new Error('User must belong to an organization');
      }

      const results = {
        successful: [] as string[],
        failed: [] as Array<{ id: string; error: string }>,
        total: timecardIds.length
      };

      // Process each timecard
      for (const timecardId of timecardIds) {
        try {
          const entryRef = db.collection('timecard_entries').doc(timecardId);
          const entryDoc = await entryRef.get();

          if (!entryDoc.exists) {
            results.failed.push({ id: timecardId, error: 'Timecard not found' });
            continue;
          }

          const entryData = entryDoc.data();
          if (!entryData) {
            results.failed.push({ id: timecardId, error: 'Timecard data not found' });
            continue;
          }

          // Verify organization match
          if (entryData.organizationId !== organizationId) {
            results.failed.push({ id: timecardId, error: 'Access denied: Different organization' });
            continue;
          }

          // Verify status is SUBMITTED
          if (entryData.status !== 'SUBMITTED') {
            results.failed.push({ id: timecardId, error: `Timecard is already ${entryData.status}` });
            continue;
          }

          // Update to APPROVED
          await entryRef.update({
            status: 'APPROVED',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedBy: userId,
            approvalComments: comments || 'Bulk approved',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          results.successful.push(timecardId);
          console.log(`✅ [BULK APPROVE] Approved timecard: ${timecardId}`);

        } catch (error: any) {
          console.error(`❌ [BULK APPROVE] Error approving ${timecardId}:`, error);
          results.failed.push({ id: timecardId, error: error.message || 'Unknown error' });
        }
      }

      console.log(`✅ [BULK APPROVE TIMECARDS] Completed: ${results.successful.length} successful, ${results.failed.length} failed`);

      return createSuccessResponse(results, `Bulk approval completed: ${results.successful.length} approved, ${results.failed.length} failed`);

    } catch (error: any) {
      console.error('❌ [BULK APPROVE TIMECARDS] Error:', error);
      return handleError(error, 'bulkApproveTimecards');
    }
  }
);

