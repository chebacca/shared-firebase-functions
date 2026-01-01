/**
 * 🔥 GET MESSAGE SESSIONS
 * Get all message sessions for the current user
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';

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

