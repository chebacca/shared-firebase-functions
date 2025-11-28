/**
 * Get My Timecard Submissions Function
 * 
 * Retrieves timecard submissions for the current user
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getMySubmissions = onCall(
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

      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log(`⏰ [GET MY SUBMISSIONS] Getting submissions for user: ${userId} in org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId);

      // Apply additional filters
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

      query = query.orderBy('date', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET MY SUBMISSIONS] Found ${timecards.length} submissions`);

      return createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        userId,
        filters: { projectId, status, startDate, endDate }
      }, 'My submissions retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET MY SUBMISSIONS] Error:', error);
      return handleError(error, 'getMySubmissions');
    }
  }
);

// HTTP function
export const getMySubmissionsHttp = onRequest(
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

      if (!userId) {
        res.status(400).json(createErrorResponse('User ID is required'));
        return;
      }

      console.log(`⏰ [GET MY SUBMISSIONS HTTP] Getting submissions for user: ${userId} in org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId);

      // Apply additional filters
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

      query = query.orderBy('date', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET MY SUBMISSIONS HTTP] Found ${timecards.length} submissions`);

      res.status(200).json(createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        userId,
        filters: { projectId, status, startDate, endDate }
      }, 'My submissions retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET MY SUBMISSIONS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getMySubmissionsHttp'));
    }
  }
);
