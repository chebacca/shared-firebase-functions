/**
 * Get Pending Timecard Approvals Function
 * 
 * Retrieves timecards pending approval for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getPendingApprovals = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId, userId, projectId } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [GET PENDING APPROVALS] Getting pending approvals for org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'submitted');

      // Apply additional filters
      if (userId) {
        query = query.where('userId', '==', userId);
      }

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      query = query.orderBy('submittedAt', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET PENDING APPROVALS] Found ${timecards.length} pending approvals`);

      return createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        filters: { userId, projectId }
      }, 'Pending approvals retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET PENDING APPROVALS] Error:', error);
      return handleError(error, 'getPendingApprovals');
    }
  }
);

// HTTP function
export const getPendingApprovalsHttp = onRequest(
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

      const { organizationId, userId, projectId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`⏰ [GET PENDING APPROVALS HTTP] Getting pending approvals for org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'submitted');

      // Apply additional filters
      if (userId) {
        query = query.where('userId', '==', userId);
      }

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      query = query.orderBy('submittedAt', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET PENDING APPROVALS HTTP] Found ${timecards.length} pending approvals`);

      res.status(200).json(createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        filters: { userId, projectId }
      }, 'Pending approvals retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET PENDING APPROVALS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getPendingApprovalsHttp'));
    }
  }
);
