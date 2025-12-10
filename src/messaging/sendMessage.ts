/**
 * 🔥 SEND MESSAGE
 * Send a message to a message session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const auth = getAuth();

/**
 * Send message (Callable Function)
 */
export const sendMessage = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId, content, replyToId, attachments, attachmentUrl, attachmentType } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!sessionId || !content) {
        throw new Error('Session ID and content are required');
      }

      console.log(`💬 [MESSAGING] Sending message to session: ${sessionId} from user: ${uid}`);

      // Verify session exists and user is a participant
      const sessionDoc = await db.collection('messageSessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        throw new Error('Message session not found');
      }

      const sessionData = sessionDoc.data();
      if (!sessionData?.participantIds?.includes(uid)) {
        throw new Error('User is not a participant in this session');
      }

      // Get user's organization
      const userRecord = await auth.getUser(uid);
      const userClaims = userRecord.customClaims || {};
      const organizationId = userClaims.organizationId;

      if (sessionData.organizationId !== organizationId) {
        throw new Error('Access denied to message session');
      }

      const messageData = {
        messageSessionId: sessionId,
        projectId: sessionData.projectId || 'global',
        organizationId,
        senderId: uid,
        content,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
        replyToId: replyToId || null,
        attachmentUrl: attachmentUrl || attachments?.[0]?.url || null,
        attachmentType: attachmentType || attachments?.[0]?.type || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const messageRef = await db.collection('messages').add(messageData);

      // Update session's updatedAt timestamp
      await db.collection('messageSessions').doc(sessionId).update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageId: messageRef.id
      });

      const message = { id: messageRef.id, ...messageData };

      console.log(`✅ [MESSAGING] Message sent: ${messageRef.id}`);

      return createSuccessResponse(message, 'Message sent successfully');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error sending message:', error);
      return createErrorResponse(
        error.message || 'Failed to send message',
        error.stack
      );
    }
  }
);

/**
 * Send message (HTTP Function)
 */
export const sendMessageHttp = onRequest(
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

      const { sessionId, content, replyToId, attachments, attachmentUrl, attachmentType } = req.body;

      if (!sessionId || !content) {
        res.status(400).json(createErrorResponse('Invalid request', 'Session ID and content are required'));
        return;
      }

      console.log(`💬 [MESSAGING HTTP] Sending message to session: ${sessionId} from user: ${decodedToken.uid}`);

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

      // Get user's organization
      const userRecord = await auth.getUser(decodedToken.uid);
      const userClaims = userRecord.customClaims || {};
      const organizationId = userClaims.organizationId;

      if (sessionData.organizationId !== organizationId) {
        res.status(403).json(createErrorResponse('Access denied', 'Access denied to message session'));
        return;
      }

      const messageData = {
        messageSessionId: sessionId,
        projectId: sessionData.projectId || 'global',
        organizationId,
        senderId: decodedToken.uid,
        content,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
        replyToId: replyToId || null,
        attachmentUrl: attachmentUrl || attachments?.[0]?.url || null,
        attachmentType: attachmentType || attachments?.[0]?.type || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const messageRef = await db.collection('messages').add(messageData);

      // Update session's updatedAt timestamp
      await db.collection('messageSessions').doc(sessionId).update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageId: messageRef.id
      });

      const message = { id: messageRef.id, ...messageData };

      console.log(`✅ [MESSAGING HTTP] Message sent: ${messageRef.id}`);

      res.status(200).json(createSuccessResponse(message, 'Message sent successfully'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error sending message:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to send message',
        error.stack
      ));
    }
  }
);

