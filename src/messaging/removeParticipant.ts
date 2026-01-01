/**
 * 🔥 REMOVE PARTICIPANT
 * Remove a participant from a message session
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();

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

