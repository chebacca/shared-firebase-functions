/**
 * 🔥 GET TURN CREDENTIALS
 * Get WebRTC TURN server credentials
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const auth = getAuth();

/**
 * Get TURN credentials (Callable Function)
 */
export const getTURNCredentials = onCall(
  {
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
  },
  async (request) => {
    try {
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      console.log(`📡 [TURN] Getting TURN credentials for user: ${uid}`);

      // TODO: Implement actual TURN credentials retrieval
      // This should fetch from your TURN server configuration
      // For now, return placeholder credentials
      const credentials = {
        urls: process.env.TURN_SERVER_URLS?.split(',') || ['turn:turnserver.example.com:3478'],
        username: process.env.TURN_USERNAME || 'username',
        credential: process.env.TURN_CREDENTIAL || 'password',
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
      };

      return createSuccessResponse(credentials, 'TURN credentials retrieved');

    } catch (error: any) {
      console.error('❌ [TURN] Error getting credentials:', error);
      return createErrorResponse(
        error.message || 'Failed to get TURN credentials',
        error.stack
      );
    }
  }
);

/**
 * Get TURN credentials (HTTP Function)
 */
export const getTURNCredentialsHttp = onRequest(
  {
    cors: true,
    invoker: 'public',
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
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

      console.log(`📡 [TURN HTTP] Getting TURN credentials for user: ${decodedToken.uid}`);

      // TODO: Implement actual TURN credentials retrieval
      const credentials = {
        urls: process.env.TURN_SERVER_URLS?.split(',') || ['turn:turnserver.example.com:3478'],
        username: process.env.TURN_USERNAME || 'username',
        credential: process.env.TURN_CREDENTIAL || 'password',
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
      };

      res.status(200).json(createSuccessResponse(credentials, 'TURN credentials retrieved'));

    } catch (error: any) {
      console.error('❌ [TURN HTTP] Error getting credentials:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to get TURN credentials',
        error.stack
      ));
    }
  }
);

