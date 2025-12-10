/**
 * 🔥 FCM TOPIC SUBSCRIPTION
 * Subscribe FCM token to a topic for targeted notifications
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Subscribe to FCM topic (Callable Function)
 */
export const subscribeToFCMTopic = onCall(
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

      console.log(`📱 [FCM] Subscribing token to topic: ${topic} for user: ${uid}`);

      // Store subscription in Firestore
      const subscriptionData = {
        token,
        userId: uid,
        topic,
        subscribedAt: new Date(),
        isActive: true
      };

      // Store in user's topic subscriptions
      await db.collection('users').doc(uid).collection('fcmTopicSubscriptions').doc(`${topic}_${token}`).set(subscriptionData, { merge: true });

      // Also store in global topic subscriptions collection
      await db.collection('fcmTopicSubscriptions').doc(`${topic}_${token}`).set({
        ...subscriptionData,
        userId: uid
      }, { merge: true });

      console.log(`✅ [FCM] Successfully subscribed token to topic: ${topic}`);

      return createSuccessResponse(
        { token, topic, subscribedAt: subscriptionData.subscribedAt },
        'Successfully subscribed to topic'
      );

    } catch (error: any) {
      console.error('❌ [FCM] Error subscribing to topic:', error);
      return createErrorResponse(
        error.message || 'Failed to subscribe to topic',
        error.stack
      );
    }
  }
);

/**
 * Subscribe to FCM topic (HTTP Function)
 */
export const subscribeToFCMTopicHttp = onRequest(
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

      console.log(`📱 [FCM HTTP] Subscribing token to topic: ${topic} for user: ${decodedToken.uid}`);

      // Store subscription in Firestore
      const subscriptionData = {
        token: fcmToken,
        userId: decodedToken.uid,
        topic,
        subscribedAt: new Date(),
        isActive: true
      };

      // Store in user's topic subscriptions
      await db.collection('users').doc(decodedToken.uid).collection('fcmTopicSubscriptions').doc(`${topic}_${fcmToken}`).set(subscriptionData, { merge: true });

      // Also store in global topic subscriptions collection
      await db.collection('fcmTopicSubscriptions').doc(`${topic}_${fcmToken}`).set({
        ...subscriptionData,
        userId: decodedToken.uid
      }, { merge: true });

      console.log(`✅ [FCM HTTP] Successfully subscribed token to topic: ${topic}`);

      res.status(200).json(createSuccessResponse(
        { token: fcmToken, topic, subscribedAt: subscriptionData.subscribedAt },
        'Successfully subscribed to topic'
      ));

    } catch (error: any) {
      console.error('❌ [FCM HTTP] Error subscribing to topic:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to subscribe to topic',
        error.stack
      ));
    }
  }
);

