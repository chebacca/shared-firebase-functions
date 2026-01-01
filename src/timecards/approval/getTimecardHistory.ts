/**
 * Get Timecard History Function
 * 
 * Retrieves approval history for a specific timecard
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const getTimecardHistory = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { timecardId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!timecardId) {
        throw new Error('Timecard ID is required');
      }

      console.log(`⏰ [GET TIMECARD HISTORY] Getting history for timecard: ${timecardId}`);

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        throw new Error('User must belong to an organization');
      }

      // Get the timecard entry
      const entryRef = db.collection('timecard_entries').doc(timecardId);
      const entryDoc = await entryRef.get();

      if (!entryDoc.exists) {
        throw new Error('Timecard entry not found');
      }

      const entryData = entryDoc.data();
      if (!entryData) {
        throw new Error('Timecard entry data not found');
      }

      // Verify organization match
      if (entryData.organizationId !== organizationId) {
        throw new Error('Access denied: Timecard belongs to different organization');
      }

      // Build history from timecard data
      const history: any[] = [];

      // Add creation event
      if (entryData.createdAt) {
        history.push({
          action: 'created',
          timestamp: entryData.createdAt,
          performedBy: entryData.userId,
          status: entryData.status || 'DRAFT'
        });
      }

      // Add submission event
      if (entryData.submittedAt) {
        history.push({
          action: 'submitted',
          timestamp: entryData.submittedAt,
          performedBy: entryData.userId,
          status: 'SUBMITTED'
        });
      }

      // Add approval event
      if (entryData.approvedAt) {
        history.push({
          action: 'approved',
          timestamp: entryData.approvedAt,
          performedBy: entryData.approvedBy,
          status: 'APPROVED',
          comments: entryData.approvalComments
        });
      }

      // Add rejection event
      if (entryData.rejectedAt) {
        history.push({
          action: 'rejected',
          timestamp: entryData.rejectedAt,
          performedBy: entryData.rejectedBy,
          status: 'REJECTED',
          reason: entryData.rejectionReason
        });
      }

      // Add escalation event
      if (entryData.escalatedAt) {
        history.push({
          action: 'escalated',
          timestamp: entryData.escalatedAt,
          performedBy: entryData.escalatedBy,
          status: 'NEEDS_REVISION',
          reason: entryData.escalationReason
        });
      }

      // Sort by timestamp (most recent first)
      history.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const bTime = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return bTime.getTime() - aTime.getTime();
      });

      console.log(`✅ [GET TIMECARD HISTORY] Found ${history.length} history events for timecard ${timecardId}`);

      return createSuccessResponse({
        timecardId,
        history,
        currentStatus: entryData.status,
        summary: {
          totalEvents: history.length,
          lastAction: history[0]?.action,
          lastActionTime: history[0]?.timestamp
        }
      }, 'Timecard history retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD HISTORY] Error:', error);
      return handleError(error, 'getTimecardHistory');
    }
  }
);

