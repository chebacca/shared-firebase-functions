/**
 * 🔥 GET PARTICIPANTS
 * Get participants for a message session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Get participants (Callable Function)
 */
export const getParticipants = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!sessionId) {
        throw new Error('Session ID is required');
      }

      // Verify session exists and user is a participant
      const sessionDoc = await db.collection('messageSessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        throw new Error('Message session not found');
      }

      const sessionData = sessionDoc.data();
      if (!sessionData?.participantIds?.includes(uid)) {
        throw new Error('User is not a participant in this session');
      }

      // Return participants from session data
      const participants = sessionData.participants || [];

      return createSuccessResponse(participants);

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error getting participants:', error);
      return createErrorResponse(
        error.message || 'Failed to get participants',
        error.stack
      );
    }
  }
);

/**
 * Get participants (HTTP Function)
 */
export const getParticipantsHttp = onRequest(
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

      const { sessionId } = req.query;

      if (!sessionId) {
        res.status(400).json(createErrorResponse('Invalid request', 'Session ID is required'));
        return;
      }

      // Verify session exists and user is a participant
      const sessionDoc = await db.collection('messageSessions').doc(String(sessionId)).get();
      if (!sessionDoc.exists) {
        res.status(404).json(createErrorResponse('Session not found', 'Message session not found'));
        return;
      }

      const sessionData = sessionDoc.data();
      if (!sessionData?.participantIds?.includes(decodedToken.uid)) {
        res.status(403).json(createErrorResponse('Access denied', 'User is not a participant in this session'));
        return;
      }

      // Return participants from session data
      const participants = sessionData.participants || [];

      res.status(200).json(createSuccessResponse(participants));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error getting participants:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to get participants',
        error.stack
      ));
    }
  }
);

