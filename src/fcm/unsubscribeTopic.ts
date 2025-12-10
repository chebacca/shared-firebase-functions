/**
 * 🔥 FCM TOPIC UNSUBSCRIPTION
 * Unsubscribe FCM token from a topic
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Unsubscribe from FCM topic (Callable Function)
 */
export const unsubscribeFromFCMTopic = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { token, topic } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!token || !topic) {
        throw new Error('FCM token and topic are required');
      }

      console.log(`📱 [FCM] Unsubscribing token from topic: ${topic} for user: ${uid}`);

      const subscriptionId = `${topic}_${token}`;

      // Mark subscription as inactive in user's collection
      await db.collection('users').doc(uid).collection('fcmTopicSubscriptions').doc(subscriptionId).update({
        isActive: false,
        unsubscribedAt: new Date()
      });

      // Also update in global topic subscriptions collection
      await db.collection('fcmTopicSubscriptions').doc(subscriptionId).update({
        isActive: false,
        unsubscribedAt: new Date()
      });

      console.log(`✅ [FCM] Successfully unsubscribed token from topic: ${topic}`);

      return createSuccessResponse(
        { token, topic, unsubscribedAt: new Date() },
        'Successfully unsubscribed from topic'
      );

    } catch (error: any) {
      console.error('❌ [FCM] Error unsubscribing from topic:', error);
      return createErrorResponse(
        error.message || 'Failed to unsubscribe from topic',
        error.stack
      );
    }
  }
);

/**
 * Unsubscribe from FCM topic (HTTP Function)
 */
export const unsubscribeFromFCMTopicHttp = onRequest(
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

      const { token: fcmToken, topic } = req.body;

      if (!fcmToken || !topic) {
        res.status(400).json(createErrorResponse('Token and topic required', 'FCM token and topic are required in request body'));
        return;
      }

      console.log(`📱 [FCM HTTP] Unsubscribing token from topic: ${topic} for user: ${decodedToken.uid}`);

      const subscriptionId = `${topic}_${fcmToken}`;

      // Mark subscription as inactive in user's collection
      await db.collection('users').doc(decodedToken.uid).collection('fcmTopicSubscriptions').doc(subscriptionId).update({
        isActive: false,
        unsubscribedAt: new Date()
      });

      // Also update in global topic subscriptions collection
      await db.collection('fcmTopicSubscriptions').doc(subscriptionId).update({
        isActive: false,
        unsubscribedAt: new Date()
      });

      console.log(`✅ [FCM HTTP] Successfully unsubscribed token from topic: ${topic}`);

      res.status(200).json(createSuccessResponse(
        { token: fcmToken, topic, unsubscribedAt: new Date() },
        'Successfully unsubscribed from topic'
      ));

    } catch (error: any) {
      console.error('❌ [FCM HTTP] Error unsubscribing from topic:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to unsubscribe from topic',
        error.stack
      ));
    }
  }
);

