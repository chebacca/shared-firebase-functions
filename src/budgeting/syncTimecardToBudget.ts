/**
 * Sync Timecard to Budget Function
 * 
 * Firebase Cloud Function to sync approved timecards to budgets
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';
import { syncApprovedTimecardToBudget, updateCommittedAmount, revertCommittedAmount } from './budgetSyncService';

/**
 * Sync a specific timecard to budget (callable function)
 */
export const syncTimecardToBudget = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const { timecardId } = request.data;

      if (!timecardId) {
        throw new Error('Timecard ID is required');
      }

      await syncApprovedTimecardToBudget(timecardId);

      return createSuccessResponse({
        timecardId,
        synced: true
      }, 'Timecard synced to budget successfully');

    } catch (error: any) {
      console.error('❌ [SYNC TIMECARD TO BUDGET] Error:', error);
      return handleError(error, 'syncTimecardToBudget');
    }
  }
);

/**
 * Sync a specific timecard to budget (HTTP function)
 */
export const syncTimecardToBudgetHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { timecardId } = req.body || req.query;

      if (!timecardId) {
        res.status(400).json(createErrorResponse('Timecard ID is required'));
        return;
      }

      await syncApprovedTimecardToBudget(timecardId);

      res.status(200).json(createSuccessResponse({
        timecardId,
        synced: true
      }, 'Timecard synced to budget successfully'));

    } catch (error: any) {
      console.error('❌ [SYNC TIMECARD TO BUDGET HTTP] Error:', error);
      res.status(500).json(handleError(error, 'syncTimecardToBudgetHttp'));
    }
  }
);

/**
 * Update committed amount for submitted timecard (HTTP function)
 */
export const updateCommittedAmountHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { timecardId } = req.body || req.query;

      if (!timecardId) {
        res.status(400).json(createErrorResponse('Timecard ID is required'));
        return;
      }

      await updateCommittedAmount(timecardId);

      res.status(200).json(createSuccessResponse({
        timecardId,
        updated: true
      }, 'Committed amount updated successfully'));

    } catch (error: any) {
      console.error('❌ [UPDATE COMMITTED AMOUNT HTTP] Error:', error);
      res.status(500).json(handleError(error, 'updateCommittedAmountHttp'));
    }
  }
);

/**
 * Revert committed amount for rejected timecard (HTTP function)
 */
export const revertCommittedAmountHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { timecardId } = req.body || req.query;

      if (!timecardId) {
        res.status(400).json(createErrorResponse('Timecard ID is required'));
        return;
      }

      await revertCommittedAmount(timecardId);

      res.status(200).json(createSuccessResponse({
        timecardId,
        reverted: true
      }, 'Committed amount reverted successfully'));

    } catch (error: any) {
      console.error('❌ [REVERT COMMITTED AMOUNT HTTP] Error:', error);
      res.status(500).json(handleError(error, 'revertCommittedAmountHttp'));
    }
  }
);

