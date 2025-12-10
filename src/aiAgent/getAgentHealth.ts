/**
 * 🔥 GET AI AGENT HEALTH
 * Get AI agent health status
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const auth = getAuth();

/**
 * Get AI agent health (Callable Function)
 */
export const getAIAgentHealth = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { agentId } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!agentId) {
        throw new Error('Agent ID is required');
      }

      console.log(`🤖 [AI AGENT] Getting health for agent: ${agentId}`);

      // TODO: Implement actual health check logic
      // This is a placeholder
      const health = {
        agentId,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      return createSuccessResponse(health, 'AI agent health retrieved');

    } catch (error: any) {
      console.error('❌ [AI AGENT] Error getting health:', error);
      return createErrorResponse(
        error.message || 'Failed to get AI agent health',
        error.stack
      );
    }
  }
);

/**
 * Get AI agent health (HTTP Function)
 */
export const getAIAgentHealthHttp = onRequest(
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

      const { agentId } = req.query;

      if (!agentId) {
        res.status(400).json(createErrorResponse('Invalid request', 'Agent ID is required'));
        return;
      }

      console.log(`🤖 [AI AGENT HTTP] Getting health for agent: ${agentId}`);

      // TODO: Implement actual health check logic
      const health = {
        agentId,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      res.status(200).json(createSuccessResponse(health, 'AI agent health retrieved'));

    } catch (error: any) {
      console.error('❌ [AI AGENT HTTP] Error getting health:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to get AI agent health',
        error.stack
      ));
    }
  }
);

