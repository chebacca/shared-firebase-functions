/**
 * Get Timecard Assignments Function
 * 
 * Retrieves timecard assignments for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
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
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId } = request.data;
      const callerId = request.auth.uid;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(callerId, organizationId));
      if (!hasAccess) {
        // Also check if user is admin/owner via custom claims
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;

        // Check for special enterprise access
        const isEnterprise = token.email === 'enterprise.user@enterprisemedia.com' &&
          (organizationId === 'enterprise-media-org' || organizationId === 'enterprise-org-001');

        if (!isAdmin && !isEnterprise) {
          console.warn(`🚨 [GET TIMECARD ASSIGNMENTS] Security violation: User ${callerId} attempted to access org ${organizationId} without access`);
          throw new HttpsError('permission-denied', 'You do not have access to this organization');
        }
      }

      console.log(`⏰ [GET TIMECARD ASSIGNMENTS] Getting assignments for org: ${organizationId} (user: ${callerId})`);

      // Query WITHOUT orderBy to avoid "missing index" 500 errors
      // We will sort in memory instead
      const assignmentsQuery = await db.collection('timecardAssignments')
        .where('isActive', '==', true)
        .where('organizationId', '==', organizationId)
        .get();

      const assignments = assignmentsQuery.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert Firestore Timestamps to ISO strings for client
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
        };
      }).sort((a, b) => {
        // Memory sort (descending by createdAt)
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      console.log(`⏰ [GET TIMECARD ASSIGNMENTS] Found ${assignments.length} assignments`);

      // Return assignments array directly to match frontend expectation
      return createSuccessResponse(assignments, 'Timecard assignments retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD ASSIGNMENTS] Error:', error);

      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }

      // Otherwise, wrap it in an HttpsError
      throw new HttpsError(
        'internal',
        error.message || 'Failed to get timecard assignments',
        error.stack || error.toString()
      );
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
