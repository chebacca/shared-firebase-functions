/**
 * 🔥 FCM TOKEN REGISTRATION
 * Register FCM token for push notifications
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Register FCM token (Callable Function)
 */
export const registerFCMToken = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { token, userAgent, timestamp } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!token) {
        throw new Error('FCM token is required');
      }

      console.log(`📱 [FCM] Registering token for user: ${uid}`);

      // Store token in Firestore
      const tokenData = {
        token,
        userId: uid,
        userAgent: userAgent || 'unknown',
        registeredAt: timestamp ? new Date(timestamp) : new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      // Store in user's FCM tokens collection
      await db.collection('users').doc(uid).collection('fcmTokens').doc(token).set(tokenData, { merge: true });

      // Also store in global fcmTokens collection for easy lookup
      await db.collection('fcmTokens').doc(token).set({
        ...tokenData,
        userId: uid
      }, { merge: true });

      console.log(`✅ [FCM] Token registered successfully for user: ${uid}`);

      return createSuccessResponse(
        { token, registeredAt: tokenData.registeredAt },
        'FCM token registered successfully'
      );

    } catch (error: any) {
      console.error('❌ [FCM] Error registering token:', error);
      return createErrorResponse(
        error.message || 'Failed to register FCM token',
        error.stack
      );
    }
  }
);

/**
 * Register FCM token (HTTP Function)
 */
export const registerFCMTokenHttp = onRequest(
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

      const { token: fcmToken, userAgent, timestamp } = req.body;

      if (!fcmToken) {
        res.status(400).json(createErrorResponse('FCM token required', 'FCM token is required in request body'));
        return;
      }

      console.log(`📱 [FCM HTTP] Registering token for user: ${decodedToken.uid}`);

      // Store token in Firestore
      const tokenData = {
        token: fcmToken,
        userId: decodedToken.uid,
        userAgent: userAgent || req.headers['user-agent'] || 'unknown',
        registeredAt: timestamp ? new Date(timestamp) : new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      // Store in user's FCM tokens collection
      await db.collection('users').doc(decodedToken.uid).collection('fcmTokens').doc(fcmToken).set(tokenData, { merge: true });

      // Also store in global fcmTokens collection for easy lookup
      await db.collection('fcmTokens').doc(fcmToken).set({
        ...tokenData,
        userId: decodedToken.uid
      }, { merge: true });

      console.log(`✅ [FCM HTTP] Token registered successfully for user: ${decodedToken.uid}`);

      res.status(200).json(createSuccessResponse(
        { token: fcmToken, registeredAt: tokenData.registeredAt },
        'FCM token registered successfully'
      ));

    } catch (error: any) {
      console.error('❌ [FCM HTTP] Error registering token:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to register FCM token',
        error.stack
      ));
    }
  }
);

