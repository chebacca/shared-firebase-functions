/**
 * 🔥 ADD PARTICIPANT
 * Add a participant to a message session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const auth = getAuth();

/**
 * Add participant (Callable Function)
 */
export const addParticipant = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId, participant } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!sessionId || !participant) {
        throw new Error('Session ID and participant are required');
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

      const participantId = participant.contactId || participant.userId || participant;
      if (!participantId) {
        throw new Error('Participant ID is required');
      }

      // Add participant if not already in session
      if (!sessionData.participantIds.includes(participantId)) {
        // 🔧 FIX: Use Timestamp.now() for joinedAt instead of serverTimestamp()
        // Firestore doesn't allow serverTimestamp() inside arrayUnion()
        const now = admin.firestore.Timestamp.now();
        
        await db.collection('messageSessions').doc(sessionId).update({
          participantIds: admin.firestore.FieldValue.arrayUnion(participantId),
          participants: admin.firestore.FieldValue.arrayUnion({
            contactId: participant.contactId || null,
            userId: participant.userId || null,
            isAdmin: participant.isAdmin || false,
            joinedAt: now // Use Timestamp instead of serverTimestamp()
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return createSuccessResponse({ success: true }, 'Participant added successfully');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error adding participant:', error);
      return createErrorResponse(
        error.message || 'Failed to add participant',
        error.stack
      );
    }
  }
);

/**
 * Add participant (HTTP Function)
 */
export const addParticipantHttp = onRequest(
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

      const { sessionId, participant } = req.body;

      if (!sessionId || !participant) {
        res.status(400).json(createErrorResponse('Invalid request', 'Session ID and participant are required'));
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

      const participantId = participant.contactId || participant.userId || participant;
      if (!participantId) {
        res.status(400).json(createErrorResponse('Invalid request', 'Participant ID is required'));
        return;
      }

      // Add participant if not already in session
      if (!sessionData.participantIds.includes(participantId)) {
        // 🔧 FIX: Use Timestamp.now() for joinedAt instead of serverTimestamp()
        // Firestore doesn't allow serverTimestamp() inside arrayUnion()
        const now = admin.firestore.Timestamp.now();
        
        await db.collection('messageSessions').doc(sessionId).update({
          participantIds: admin.firestore.FieldValue.arrayUnion(participantId),
          participants: admin.firestore.FieldValue.arrayUnion({
            contactId: participant.contactId || null,
            userId: participant.userId || null,
            isAdmin: participant.isAdmin || false,
            joinedAt: now // Use Timestamp instead of serverTimestamp()
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      res.status(200).json(createSuccessResponse({ success: true }, 'Participant added successfully'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error adding participant:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to add participant',
        error.stack
      ));
    }
  }
);

