/**
 * Take Approval Action Function
 * 
 * Handles timecard approval actions (approve, reject, escalate)
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const takeApprovalAction = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { approvalId, action, comments, rejectionReason, escalationReason } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!approvalId) {
        throw new Error('Approval ID is required');
      }

      if (!action || !['approve', 'reject', 'escalate'].includes(action)) {
        throw new Error('Valid action is required (approve, reject, or escalate)');
      }

      console.log(`⏰ [TAKE APPROVAL ACTION] ${action} for approval: ${approvalId} by user: ${userId}`);

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        throw new Error('User must belong to an organization');
      }

      // Get the timecard entry - try both collections for compatibility
      let entryRef = db.collection('timecards').doc(approvalId);
      let entryDoc = await entryRef.get();

      // Fallback to timecard_entries if not found in timecards
      if (!entryDoc.exists) {
        entryRef = db.collection('timecard_entries').doc(approvalId);
        entryDoc = await entryRef.get();
      }

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

      // Verify status is in a pending/submitted state (allow multiple status values)
      const pendingStatuses = ['SUBMITTED', 'PENDING', 'PENDING_APPROVAL', 'submitted', 'pending', 'pending_approval'];
      const currentStatus = (entryData.status || '').toUpperCase();
      const isPending = pendingStatuses.some(status => currentStatus === status.toUpperCase());
      
      if (!isPending) {
        throw new Error(`Timecard is already ${entryData.status}, cannot ${action}`);
      }

      // Map actions to status
      const statusMap: Record<string, string> = {
        'approve': 'APPROVED',
        'reject': 'REJECTED',
        'escalate': 'NEEDS_REVISION'
      };

      const newStatus = statusMap[action];
      const updateData: any = {
        status: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Add action-specific fields
      if (action === 'approve') {
        updateData.approvedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.approvedBy = userId;
        if (comments) {
          updateData.approvalComments = comments;
        }
      } else if (action === 'reject') {
        updateData.rejectedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.rejectedBy = userId;
        updateData.rejectionReason = rejectionReason || comments || 'No reason provided';
      } else if (action === 'escalate') {
        updateData.escalatedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.escalatedBy = userId;
        updateData.escalationReason = escalationReason || comments || 'Escalated for review';
      }

      // Update the timecard entry
      await entryRef.update(updateData);

      // Get updated document
      const updatedDoc = await entryRef.get();
      const updatedData = updatedDoc.data();

      console.log(`✅ [TAKE APPROVAL ACTION] Successfully ${action}d timecard ${approvalId}`);

      return createSuccessResponse({
        id: updatedDoc.id,
        timecardId: updatedDoc.id,
        status: newStatus,
        timecard: {
          id: updatedDoc.id,
          ...updatedData
        },
        action,
        performedBy: userId,
        performedAt: new Date().toISOString()
      }, `Timecard ${action}d successfully`);

    } catch (error: any) {
      console.error('❌ [TAKE APPROVAL ACTION] Error:', error);
      return handleError(error, 'takeApprovalAction');
    }
  }
);

