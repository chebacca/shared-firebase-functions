/**
 * Get Timecard Approval History Function
 * 
 * Retrieves timecard approval history for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getApprovalHistory = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId, userId, projectId, status, startDate, endDate } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [GET APPROVAL HISTORY] Getting approval history for org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('status', 'in', ['approved', 'rejected']);

      // Apply additional filters
      if (userId) {
        query = query.where('userId', '==', userId);
      }

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      if (status) {
        query = query.where('status', '==', status);
      }

      if (startDate) {
        query = query.where('date', '>=', startDate);
      }

      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      query = query.orderBy('approvedAt', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET APPROVAL HISTORY] Found ${timecards.length} approval history records`);

      return createSuccessResponse({
        approvalHistory: timecards,
        summary: {
          total: timecards.length,
          approved: timecards.filter((tc: any) => tc.status === 'approved').length,
          rejected: timecards.filter((tc: any) => tc.status === 'rejected').length,
          escalated: timecards.filter((tc: any) => tc.escalatedAt).length,
          completed: timecards.filter((tc: any) => tc.status === 'approved' || tc.status === 'rejected').length,
          averageProcessingTime: 0 // Calculate if needed
        },
        pagination: {
          page: 1,
          limit: timecards.length,
          total: timecards.length,
          totalPages: 1
        }
      }, 'Approval history retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET APPROVAL HISTORY] Error:', error);
      return handleError(error, 'getApprovalHistory');
    }
  }
);

// HTTP function
export const getApprovalHistoryHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      // Set CORS headers
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { organizationId, userId, projectId, status, startDate, endDate } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`⏰ [GET APPROVAL HISTORY HTTP] Getting approval history for org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('status', 'in', ['approved', 'rejected']);

      // Apply additional filters
      if (userId) {
        query = query.where('userId', '==', userId);
      }

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      if (status) {
        query = query.where('status', '==', status);
      }

      if (startDate) {
        query = query.where('date', '>=', startDate);
      }

      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      query = query.orderBy('approvedAt', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          ...data
        };
      });

      console.log(`⏰ [GET APPROVAL HISTORY HTTP] Found ${timecards.length} approval history records`);

      res.status(200).json(createSuccessResponse({
        approvalHistory: timecards,
        summary: {
          total: timecards.length,
          approved: timecards.filter((tc: any) => tc.status === 'approved').length,
          rejected: timecards.filter((tc: any) => tc.status === 'rejected').length,
          escalated: timecards.filter((tc: any) => tc.escalatedAt).length,
          completed: timecards.filter((tc: any) => tc.status === 'approved' || tc.status === 'rejected').length,
          averageProcessingTime: 0 // Calculate if needed
        },
        pagination: {
          page: 1,
          limit: timecards.length,
          total: timecards.length,
          totalPages: 1
        }
      }, 'Approval history retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET APPROVAL HISTORY HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getApprovalHistoryHttp'));
    }
  }
);
