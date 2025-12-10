/**
 * 🔥 GET USER PREFERENCES
 * Get user AI preferences
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Get user preferences (Callable Function)
 */
export const getUserPreferences = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      console.log(`🤖 [AI AGENT] Getting preferences for user: ${uid}`);

      // Get user preferences from Firestore
      const prefsDoc = await db.collection('users').doc(uid).collection('preferences').doc('ai').get();
      
      const preferences = prefsDoc.exists ? prefsDoc.data() : {
        defaultAgent: 'master-agent',
        enabled: true,
        notifications: true
      };

      return createSuccessResponse(preferences, 'User preferences retrieved');

    } catch (error: any) {
      console.error('❌ [AI AGENT] Error getting preferences:', error);
      return createErrorResponse(
        error.message || 'Failed to get user preferences',
        error.stack
      );
    }
  }
);

/**
 * Get user preferences (HTTP Function)
 */
export const getUserPreferencesHttp = onRequest(
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

      console.log(`🤖 [AI AGENT HTTP] Getting preferences for user: ${decodedToken.uid}`);

      // Get user preferences from Firestore
      const prefsDoc = await db.collection('users').doc(decodedToken.uid).collection('preferences').doc('ai').get();
      
      const preferences = prefsDoc.exists ? prefsDoc.data() : {
        defaultAgent: 'master-agent',
        enabled: true,
        notifications: true
      };

      res.status(200).json(createSuccessResponse(preferences, 'User preferences retrieved'));

    } catch (error: any) {
      console.error('❌ [AI AGENT HTTP] Error getting preferences:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to get user preferences',
        error.stack
      ));
    }
  }
);

