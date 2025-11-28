/**
 * Get Timecard Assignments Function
 * 
 * Retrieves timecard assignments for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getTimecardAssignments = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: [
      'http://localhost:4003',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://backbone-client.web.app',
      'https://backbone-logic.web.app'
    ]
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const { organizationId } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [GET TIMECARD ASSIGNMENTS] Getting assignments for org: ${organizationId} (user: ${request.auth.uid})`);

      const assignmentsQuery = await db.collection('timecardAssignments')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();

      const assignments = assignmentsQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET TIMECARD ASSIGNMENTS] Found ${assignments.length} assignments`);

      return createSuccessResponse({
        assignments,
        count: assignments.length,
        organizationId
      }, 'Timecard assignments retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD ASSIGNMENTS] Error:', error);
      return handleError(error, 'getTimecardAssignments');
    }
  }
);

// HTTP function
export const getTimecardAssignmentsHttp = onRequest(
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

      const { organizationId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`⏰ [GET TIMECARD ASSIGNMENTS HTTP] Getting assignments for org: ${organizationId}`);

      const assignmentsQuery = await db.collection('timecardAssignments')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .get();

      const assignments = assignmentsQuery.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || new Date()
        };
      }).sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bTime = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bTime.getTime() - aTime.getTime();
      });

      console.log(`⏰ [GET TIMECARD ASSIGNMENTS HTTP] Found ${assignments.length} assignments`);

      res.status(200).json(createSuccessResponse({
        assignments,
        count: assignments.length,
        organizationId
      }, 'Timecard assignments retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET TIMECARD ASSIGNMENTS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getTimecardAssignmentsHttp'));
    }
  }
);
