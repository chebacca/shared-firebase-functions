/**
 * 🔥 UPDATE MESSAGE SESSION
 * Update a message session (e.g., name, description)
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const auth = getAuth();

/**
 * Update message session (Callable Function)
 */
export const updateMessageSession = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { sessionId, name, description, isArchived } = request.data;
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

      // Build update data
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (isArchived !== undefined) updateData.isArchived = isArchived;

      await db.collection('messageSessions').doc(sessionId).update(updateData);

      return createSuccessResponse({ success: true }, 'Message session updated successfully');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error updating message session:', error);
      return createErrorResponse(
        error.message || 'Failed to update message session',
        error.stack
      );
    }
  }
);

/**
 * Update message session (HTTP Function)
 */
export const updateMessageSessionHttp = onRequest(
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

      if (req.method !== 'PUT') {
        res.status(405).json(createErrorResponse('Method not allowed', 'Only PUT method is supported'));
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
      const { name, description, isArchived } = req.body;

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

      // Build update data
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (isArchived !== undefined) updateData.isArchived = isArchived;

      await db.collection('messageSessions').doc(String(sessionId)).update(updateData);

      res.status(200).json(createSuccessResponse({ success: true }, 'Message session updated successfully'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error updating message session:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to update message session',
        error.stack
      ));
    }
  }
);

