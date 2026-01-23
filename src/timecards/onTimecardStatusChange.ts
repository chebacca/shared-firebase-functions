/**
 * Timecard Status Change Trigger
 * 
 * Firestore trigger that watches for timecard status changes
 * and automatically syncs to budgets
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { syncApprovedTimecardToBudget, updateCommittedAmount, revertCommittedAmount } from '../budgeting/budgetSyncService';

/**
 * Trigger when timecard document is updated
 */
export const onTimecardStatusChange = onDocumentUpdated(
  'timecard_entries/{timecardId}',
  async (event) => {
    try {
      const timecardId = event.params.timecardId;
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();

      if (!beforeData || !afterData) {
        console.log(`⚠️ [TIMECARD TRIGGER] Missing data for timecard ${timecardId}`);
        return;
      }

      const beforeStatus = beforeData.status;
      const afterStatus = afterData.status;

      // Only process if status actually changed
      if (beforeStatus === afterStatus) {
        return;
      }

      console.log(`🔄 [TIMECARD TRIGGER] Timecard ${timecardId} status changed: ${beforeStatus} → ${afterStatus}`);

      // Handle status changes
      if (afterStatus === 'approved') {
        // Timecard was approved - sync to budget
        try {
          await syncApprovedTimecardToBudget(timecardId);
          console.log(`✅ [TIMECARD TRIGGER] Successfully synced approved timecard ${timecardId} to budget`);
        } catch (error: any) {
          console.error(`❌ [TIMECARD TRIGGER] Error syncing approved timecard ${timecardId}:`, error);
          // Don't throw - we don't want to fail the timecard update
        }
      } else if (afterStatus === 'submitted') {
        // Timecard was submitted - update committed amount
        try {
          await updateCommittedAmount(timecardId);
          console.log(`✅ [TIMECARD TRIGGER] Successfully updated committed amount for timecard ${timecardId}`);
        } catch (error: any) {
          console.error(`❌ [TIMECARD TRIGGER] Error updating committed amount for timecard ${timecardId}:`, error);
          // Don't throw - we don't want to fail the timecard update
        }
      } else if (afterStatus === 'rejected' && beforeStatus === 'submitted') {
        // Timecard was rejected after being submitted - revert committed amount
        try {
          await revertCommittedAmount(timecardId);
          console.log(`✅ [TIMECARD TRIGGER] Successfully reverted committed amount for rejected timecard ${timecardId}`);
        } catch (error: any) {
          console.error(`❌ [TIMECARD TRIGGER] Error reverting committed amount for timecard ${timecardId}:`, error);
          // Don't throw - we don't want to fail the timecard update
        }
      } else if (afterStatus === 'draft' && beforeStatus === 'submitted') {
        // Timecard was changed back to draft from submitted - revert committed amount
        try {
          await revertCommittedAmount(timecardId);
          console.log(`✅ [TIMECARD TRIGGER] Successfully reverted committed amount for draft timecard ${timecardId}`);
        } catch (error: any) {
          console.error(`❌ [TIMECARD TRIGGER] Error reverting committed amount for timecard ${timecardId}:`, error);
          // Don't throw - we don't want to fail the timecard update
        }
      }

    } catch (error: any) {
      console.error(`❌ [TIMECARD TRIGGER] Unexpected error processing timecard status change:`, error);
      // Don't throw - we don't want to fail the timecard update
    }
  }
);

