/**
 * 🔥 CALL AI AGENT
 * Call AI agent with a message
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const auth = getAuth();

/**
 * Call AI agent (Callable Function)
 */
export const callAIAgent = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { agentId, message, context } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!agentId || !message) {
        throw new Error('Agent ID and message are required');
      }

      console.log(`🤖 [AI AGENT] Calling agent: ${agentId} for user: ${uid}`);

      // TODO: Implement actual AI agent call logic
      // This is a placeholder - implement based on your AI agent service
      // For now, return a mock response
      const response = {
        agentId,
        message,
        response: 'AI agent response (placeholder - implement actual logic)',
        timestamp: new Date().toISOString()
      };

      return createSuccessResponse(response, 'AI agent called successfully');

    } catch (error: any) {
      console.error('❌ [AI AGENT] Error calling agent:', error);
      return createErrorResponse(
        error.message || 'Failed to call AI agent',
        error.stack
      );
    }
  }
);

/**
 * Call AI agent (HTTP Function)
 */
export const callAIAgentHttp = onRequest(
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

      const { agentId, message, context } = req.body;

      if (!agentId || !message) {
        res.status(400).json(createErrorResponse('Invalid request', 'Agent ID and message are required'));
        return;
      }

      console.log(`🤖 [AI AGENT HTTP] Calling agent: ${agentId} for user: ${decodedToken.uid}`);

      // TODO: Implement actual AI agent call logic
      // This is a placeholder - implement based on your AI agent service
      const response = {
        agentId,
        message,
        response: 'AI agent response (placeholder - implement actual logic)',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(createSuccessResponse(response, 'AI agent called successfully'));

    } catch (error: any) {
      console.error('❌ [AI AGENT HTTP] Error calling agent:', error);
      res.status(500).json(createErrorResponse(
        error.message || 'Failed to call AI agent',
        error.stack
      ));
    }
  }
);

