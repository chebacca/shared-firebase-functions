/**
 * 🔥 GET MESSAGE SESSIONS
 * Get all message sessions for the current user
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Get message sessions (Callable Function)
 */
export const getMessageSessions = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { projectId } = request.data || {};
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      console.log(`💬 [MESSAGING] Getting message sessions for user: ${uid}, projectId: ${projectId || 'all'}`);

      // Get user's organization
      const userRecord = await auth.getUser(uid);
      const userClaims = userRecord.customClaims || {};
      const organizationId = userClaims.organizationId;

      if (!organizationId) {
        return createSuccessResponse([], 'No organization found');
      }

      // Build query
      let sessionsQuery = db.collection('messageSessions')
        .where('organizationId', '==', organizationId);

      // Filter by project if provided
      if (projectId) {
        sessionsQuery = sessionsQuery.where('projectId', '==', projectId);
      }

      // Get sessions where user is a participant
      const sessionsSnapshot = await sessionsQuery.get();
      const sessions = sessionsSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          return data.participantIds?.includes(uid);
        })
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

      console.log(`✅ [MESSAGING] Found ${sessions.length} message sessions`);

      return createSuccessResponse(sessions);

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error getting message sessions:', error);
      return createErrorResponse(
        error.message || 'Failed to get message sessions',
        error.stack
      );
    }
  }
);

/**
 * Get message sessions (HTTP Function)
 */
export const getMessageSessionsHttp = onRequest(
  {
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

      if (req.method !== 'GET') {
        res.status(405).json(createErrorResponse('Method not allowed', 'Only GET method is supported'));
        return;
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(token);
      } catch (error) {
        res.status(401).json(createErrorResponse('Invalid token', 'Authentication token is invalid'));
        return;
      }

      const { projectId } = req.query;

      console.log(`💬 [MESSAGING HTTP] Getting message sessions for user: ${decodedToken.uid}, projectId: ${projectId || 'all'}`);

      // Get user's organization
      const userRecord = await auth.getUser(decodedToken.uid);
      const userClaims = userRecord.customClaims || {};
      const organizationId = userClaims.organizationId;

      if (!organizationId) {
        res.status(200).json(createSuccessResponse([], 'No organization found'));
        return;
      }

      // Build query
      let sessionsQuery = db.collection('messageSessions')
        .where('organizationId', '==', organizationId);

      // Filter by project if provided
      if (projectId) {
        sessionsQuery = sessionsQuery.where('projectId', '==', projectId);
      }

      // Get sessions where user is a participant
      const sessionsSnapshot = await sessionsQuery.get();
      const sessions = sessionsSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          return data.participantIds?.includes(decodedToken.uid);
        })
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

      console.log(`✅ [MESSAGING HTTP] Found ${sessions.length} message sessions`);

      res.status(200).json(createSuccessResponse(sessions));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error getting message sessions:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to get message sessions',
        error.stack
      ));
    }
  }
);

