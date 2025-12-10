/**
 * 🔥 MARK MESSAGES AS READ
 * Mark messages as read in a session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const auth = getAuth();

/**
 * Mark messages as read (Callable Function)
 */
export const markMessagesAsRead = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId, messageIds } = request.data;
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

      // Update messages
      if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
        const batch = db.batch();
        for (const messageId of messageIds) {
          const messageRef = db.collection('messages').doc(messageId);
          batch.update(messageRef, {
            isRead: true,
            readAt: admin.firestore.FieldValue.serverTimestamp(),
            readBy: admin.firestore.FieldValue.arrayUnion(uid)
          });
        }
        await batch.commit();
      } else {
        // Mark all messages in session as read
        const messagesQuery = await db.collection('messages')
          .where('messageSessionId', '==', sessionId)
          .where('isRead', '==', false)
          .get();

        const batch = db.batch();
        messagesQuery.docs.forEach(doc => {
          batch.update(doc.ref, {
            isRead: true,
            readAt: admin.firestore.FieldValue.serverTimestamp(),
            readBy: admin.firestore.FieldValue.arrayUnion(uid)
          });
        });
        await batch.commit();
      }

      return createSuccessResponse({ success: true }, 'Messages marked as read');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error marking messages as read:', error);
      return createErrorResponse(
        error.message || 'Failed to mark messages as read',
        error.stack
      );
    }
  }
);

/**
 * Mark messages as read (HTTP Function)
 */
export const markMessagesAsReadHttp = onRequest(
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

      if (req.method !== 'POST') {
        res.status(405).json(createErrorResponse('Method not allowed', 'Only POST method is supported'));
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

      const { sessionId, messageIds } = req.body;

      if (!sessionId) {
        res.status(400).json(createErrorResponse('Invalid request', 'Session ID is required'));
        return;
      }

      // Verify session exists and user is a participant
      const sessionDoc = await db.collection('messageSessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        res.status(404).json(createErrorResponse('Session not found', 'Message session not found'));
        return;
      }

      const sessionData = sessionDoc.data();
      if (!sessionData?.participantIds?.includes(decodedToken.uid)) {
        res.status(403).json(createErrorResponse('Access denied', 'User is not a participant in this session'));
        return;
      }

      // Update messages
      if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
        const batch = db.batch();
        for (const messageId of messageIds) {
          const messageRef = db.collection('messages').doc(messageId);
          batch.update(messageRef, {
            isRead: true,
            readAt: admin.firestore.FieldValue.serverTimestamp(),
            readBy: admin.firestore.FieldValue.arrayUnion(decodedToken.uid)
          });
        }
        await batch.commit();
      } else {
        // Mark all messages in session as read
        const messagesQuery = await db.collection('messages')
          .where('messageSessionId', '==', sessionId)
          .where('isRead', '==', false)
          .get();

        const batch = db.batch();
        messagesQuery.docs.forEach(doc => {
          batch.update(doc.ref, {
            isRead: true,
            readAt: admin.firestore.FieldValue.serverTimestamp(),
            readBy: admin.firestore.FieldValue.arrayUnion(decodedToken.uid)
          });
        });
        await batch.commit();
      }

      res.status(200).json(createSuccessResponse({ success: true }, 'Messages marked as read'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error marking messages as read:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to mark messages as read',
        error.stack
      ));
    }
  }
);

