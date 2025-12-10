/**
 * 🔥 DELETE MESSAGE
 * Delete a message from a session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Delete message (Callable Function)
 */
export const deleteMessage = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId, messageId } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!sessionId || !messageId) {
        throw new Error('Session ID and message ID are required');
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

      // Verify message exists and user is the sender
      const messageDoc = await db.collection('messages').doc(messageId).get();
      if (!messageDoc.exists) {
        throw new Error('Message not found');
      }

      const messageData = messageDoc.data();
      if (messageData?.senderId !== uid) {
        throw new Error('User can only delete their own messages');
      }

      // Delete message
      await db.collection('messages').doc(messageId).delete();

      return createSuccessResponse({ success: true }, 'Message deleted successfully');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error deleting message:', error);
      return createErrorResponse(
        error.message || 'Failed to delete message',
        error.stack
      );
    }
  }
);

/**
 * Delete message (HTTP Function)
 */
export const deleteMessageHttp = onRequest(
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

      const { sessionId, messageId } = req.query;

      if (!sessionId || !messageId) {
        res.status(400).json(createErrorResponse('Invalid request', 'Session ID and message ID are required'));
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

      // Verify message exists and user is the sender
      const messageDoc = await db.collection('messages').doc(String(messageId)).get();
      if (!messageDoc.exists) {
        res.status(404).json(createErrorResponse('Message not found', 'Message not found'));
        return;
      }

      const messageData = messageDoc.data();
      if (messageData?.senderId !== decodedToken.uid) {
        res.status(403).json(createErrorResponse('Access denied', 'User can only delete their own messages'));
        return;
      }

      // Delete message
      await db.collection('messages').doc(String(messageId)).delete();

      res.status(200).json(createSuccessResponse({ success: true }, 'Message deleted successfully'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error deleting message:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to delete message',
        error.stack
      ));
    }
  }
);

