/**
 * 🔥 CREATE MESSAGE SESSION
 * Create a new message session
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const auth = getAuth();

/**
 * Create message session (Callable Function)
 */
export const createMessageSession = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { type, projectId, participants, name, description } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!type || !participants || !Array.isArray(participants)) {
        throw new Error('Type and participants array are required');
      }

      console.log(`💬 [MESSAGING] Creating message session for user: ${uid}`);

      // Get user's organization
      const userRecord = await auth.getUser(uid);
      const userClaims = userRecord.customClaims || {};
      const organizationId = userClaims.organizationId;

      if (!organizationId) {
        throw new Error('User must be associated with an organization');
      }

      // Ensure current user is in participants
      const participantIds = [...new Set([uid, ...participants.map((p: any) => p.contactId || p.userId || p).filter(Boolean)])];

      // 🔧 FIX: Use Timestamp.now() for joinedAt instead of serverTimestamp()
      // Firestore doesn't allow serverTimestamp() inside arrays
      const now = admin.firestore.Timestamp.now();

      const sessionData = {
        type,
        projectId: projectId || 'global',
        organizationId,
        participantIds,
        participants: participants.map((p: any) => ({
          contactId: p.contactId || null,
          userId: p.userId || null,
          isAdmin: p.isAdmin || false,
          joinedAt: now // Use Timestamp instead of serverTimestamp()
        })),
        name: name || null,
        description: description || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isArchived: false
      };

      const sessionRef = await db.collection('messageSessions').add(sessionData);
      const session = { id: sessionRef.id, ...sessionData };

      console.log(`✅ [MESSAGING] Created message session: ${sessionRef.id}`);

      return createSuccessResponse(session, 'Message session created successfully');

    } catch (error: any) {
      console.error('❌ [MESSAGING] Error creating message session:', error);
      return createErrorResponse(
        error.message || 'Failed to create message session',
        error.stack
      );
    }
  }
);

/**
 * Create message session (HTTP Function)
 */
export const createMessageSessionHttp = onRequest(
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

      const { type, projectId, participants, name, description } = req.body;

      if (!type || !participants || !Array.isArray(participants)) {
        res.status(400).json(createErrorResponse('Invalid request', 'Type and participants array are required'));
        return;
      }

      console.log(`💬 [MESSAGING HTTP] Creating message session for user: ${decodedToken.uid}`);

      // Get user's organization
      const userRecord = await auth.getUser(decodedToken.uid);
      const userClaims = userRecord.customClaims || {};
      const organizationId = userClaims.organizationId;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization required', 'User must be associated with an organization'));
        return;
      }

      // Ensure current user is in participants
      const participantIds = [...new Set([decodedToken.uid, ...participants.map((p: any) => p.contactId || p.userId || p).filter(Boolean)])];

      // 🔧 FIX: Use Timestamp.now() for joinedAt instead of serverTimestamp()
      // Firestore doesn't allow serverTimestamp() inside arrays
      const now = admin.firestore.Timestamp.now();

      const sessionData = {
        type,
        projectId: projectId || 'global',
        organizationId,
        participantIds,
        participants: participants.map((p: any) => ({
          contactId: p.contactId || null,
          userId: p.userId || null,
          isAdmin: p.isAdmin || false,
          joinedAt: now // Use Timestamp instead of serverTimestamp()
        })),
        name: name || null,
        description: description || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isArchived: false
      };

      const sessionRef = await db.collection('messageSessions').add(sessionData);
      const session = { id: sessionRef.id, ...sessionData };

      console.log(`✅ [MESSAGING HTTP] Created message session: ${sessionRef.id}`);

      res.status(200).json(createSuccessResponse(session, 'Message session created successfully'));

    } catch (error: any) {
      console.error('❌ [MESSAGING HTTP] Error creating message session:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to create message session',
        error.stack
      ));
    }
  }
);

