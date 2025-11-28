/**
 * Get All Timecards Function
 * 
 * Retrieves all timecards for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getAllTimecards = onCall(
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

      console.log(`⏰ [GET ALL TIMECARDS] Getting timecards for org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId);

      // Apply filters
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

      query = query.orderBy('date', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET ALL TIMECARDS] Found ${timecards.length} timecards`);

      return createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        filters: { userId, projectId, status, startDate, endDate }
      }, 'Timecards retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET ALL TIMECARDS] Error:', error);
      return handleError(error, 'getAllTimecards');
    }
  }
);

// HTTP function
export const getAllTimecardsHttp = onRequest(
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

      console.log(`⏰ [GET ALL TIMECARDS HTTP] Getting timecards for org: ${organizationId}`);

      let query = db.collection('timecards')
        .where('organizationId', '==', organizationId);

      // Apply filters
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

      query = query.orderBy('date', 'desc');

      const timecardsSnapshot = await query.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET ALL TIMECARDS HTTP] Found ${timecards.length} timecards`);

      res.status(200).json(createSuccessResponse({
        timecards,
        count: timecards.length,
        organizationId,
        filters: { userId, projectId, status, startDate, endDate }
      }, 'Timecards retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET ALL TIMECARDS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getAllTimecardsHttp'));
    }
  }
);
