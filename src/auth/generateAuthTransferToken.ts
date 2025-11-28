/**
 * Generate Auth Transfer Token Cloud Function
 * 
 * Generates short-lived custom Firebase tokens for cross-app authentication
 * Used when users navigate between Call Sheet App and EDL Converter
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

interface GenerateTransferTokenRequest {
  userId: string;
  userEmail: string;
  expiresIn?: number; // seconds, default 5 minutes
}

interface GenerateTransferTokenResponse {
  success: boolean;
  token?: string;
  error?: string;
  expiresAt?: string;
}

export const generateAuthTransferToken = onRequest(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  async (request, response) => {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      response.set('Access-Control-Allow-Origin', '*');
      response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.status(204).send('');
      return;
    }

    // Set CORS headers for all responses
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Only allow POST requests
    if (request.method !== 'POST') {
      response.status(405).json({
        success: false,
        error: 'Method not allowed. Use POST.'
      });
      return;
    }

    try {
      // Verify the request is authenticated
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        response.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      // Verify the ID token
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const requestingUserId = decodedToken.uid;

      logger.info('🔑 [generateAuthTransferToken] Request from user:', requestingUserId);

      // Parse request body
      const { userId, userEmail, expiresIn = 300 } = request.body as GenerateTransferTokenRequest;

      if (!userId || !userEmail) {
        response.status(400).json({
          success: false,
          error: 'userId and userEmail are required'
        });
        return;
      }

      // Verify the requesting user matches the userId (security check)
      if (requestingUserId !== userId) {
        logger.warn('🚨 [generateAuthTransferToken] User mismatch:', {
          requestingUserId,
          requestedUserId: userId
        });
        response.status(403).json({
          success: false,
          error: 'Unauthorized: User ID mismatch'
        });
        return;
      }

      // Validate expiration time (max 10 minutes for security)
      const maxExpiry = 600; // 10 minutes
      const actualExpiry = Math.min(expiresIn, maxExpiry);

      logger.info('🔐 [generateAuthTransferToken] Generating custom token:', {
        userId,
        userEmail,
        expiresIn: actualExpiry
      });

      // Generate custom token
      const customToken = await getAuth().createCustomToken(userId, {
        email: userEmail,
        cross_app_transfer: true,
        generated_at: Date.now(),
        expires_in: actualExpiry
      });

      const expiresAt = new Date(Date.now() + actualExpiry * 1000);

      logger.info('✅ [generateAuthTransferToken] Custom token generated successfully:', {
        userId,
        expiresAt: expiresAt.toISOString()
      });

      const result: GenerateTransferTokenResponse = {
        success: true,
        token: customToken,
        expiresAt: expiresAt.toISOString()
      };

      response.status(200).json(result);

    } catch (error) {
      logger.error('❌ [generateAuthTransferToken] Error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      response.status(500).json({
        success: false,
        error: `Failed to generate transfer token: ${errorMessage}`
      });
    }
  }
);
