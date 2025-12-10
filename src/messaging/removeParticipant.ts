/**
 * 🔥 REMOVE PARTICIPANT
 * Remove a participant from a message session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const auth = getAuth();

/**
 * Remove participant (Callable Function)
 */
export const removeParticipant = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId, participantId } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!sessionId || !participantId) {
        throw new Error('Session ID and participant ID are required');
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

      // Remove participant
      await db.collection('messageSessions').doc(sessionId).update({
        participantIds: admin.firestore.FieldValue.arrayRemove(participantId),
        participants: admin.firestore.FieldValue.arrayRemove(
          sessionData.participants?.find((p: any) => 
            (p.contactId === participantId || p.userId === participantId)
          )
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return createSuccessResponse({ success: true }, 'Participant removed successfully');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error removing participant:', error);
      return createErrorResponse(
        error.message || 'Failed to remove participant',
        error.stack
      );
    }
  }
);

/**
 * Remove participant (HTTP Function)
 */
export const removeParticipantHttp = onRequest(
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

      if (req.method !== 'DELETE') {
        res.status(405).json(createErrorResponse('Method not allowed', 'Only DELETE method is supported'));
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

      const { sessionId, participantId } = req.query;

      if (!sessionId || !participantId) {
        res.status(400).json(createErrorResponse('Invalid request', 'Session ID and participant ID are required'));
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

      // Remove participant
      await db.collection('messageSessions').doc(String(sessionId)).update({
        participantIds: admin.firestore.FieldValue.arrayRemove(participantId),
        participants: admin.firestore.FieldValue.arrayRemove(
          sessionData.participants?.find((p: any) => 
            (p.contactId === participantId || p.userId === participantId)
          )
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(200).json(createSuccessResponse({ success: true }, 'Participant removed successfully'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error removing participant:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to remove participant',
        error.stack
      ));
    }
  }
);

