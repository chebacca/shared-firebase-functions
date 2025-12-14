/**
 * 🔥 CALL AI AGENT
 * Call AI agent with a message
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';
import { gatherGlobalContext, gatherMinimalContextForGraph } from '../ai/contextAggregation/GlobalContextService';
import { createGeminiService, geminiApiKey } from '../ai/GeminiService';

const auth = getAuth();

/**
 * Quick Intent Detection
 * 
 * Lightweight detection of user intent before expensive context gathering.
 * Returns 'graph' for graph-related queries, 'full' for everything else.
 */
function detectQuickIntent(message: string): 'graph' | 'full' {
  const lower = message.toLowerCase().trim();
  
  // Graph-specific keywords
  const graphKeywords = [
    'graph',
    'relationship',
    'relationships',
    'connection',
    'connections',
    'up to',
    'doing',
    'working on',
    'what is',
    'show me what',
    'backbone graph',
    'knowledge graph',
    'visualization',
    'structure',
    'map',
    'network'
  ];
  
  // Check if message contains graph-related keywords
  for (const keyword of graphKeywords) {
    if (lower.includes(keyword)) {
      console.log(`🎯 [Quick Intent] Detected graph intent from keyword: "${keyword}"`);
      return 'graph';
    }
  }
  
  // Default to full context for ambiguous queries
  return 'full';
}

/**
 * Call AI agent (Callable Function)
 */
export const callAIAgent = onCall(
  {
    cors: true,
    secrets: [geminiApiKey], // Add Gemini API key as required secret
  },
  async (request) => {
    try {
      console.log('🦄 UNICORN DEBUG: Real Gemini Service Active - Build Verified');
      const { agentId, message, context } = request.data;
      const uid = request.auth?.uid;



      if (!uid) {
        throw new Error('User must be authenticated');
      }

      if (!agentId || !message) {
        throw new Error('Agent ID and message are required');
      }

      console.log(`🤖 [AI AGENT] Calling agent: ${agentId} for user: ${uid}`);

      // 1. Get User's Organization ID
      const userRecord = await auth.getUser(uid);
      const organizationId = userRecord.customClaims?.organizationId as string;



      if (!organizationId) {
        throw new Error('User does not belong to an organization');
      }

      // 2. Quick Intent Detection (Optimization)
      const quickIntent = detectQuickIntent(message);
      console.log(`🎯 [AI AGENT] Quick intent detected: ${quickIntent}`);

      // 3. Gather Context (Optimized based on intent)
      let globalContext;
      if (quickIntent === 'graph') {
        console.log(`⚡ [AI AGENT] Using minimal context for graph request (optimization)`);
        globalContext = await gatherMinimalContextForGraph(organizationId, uid);
      } else {
        console.log(`📊 [AI AGENT] Gathering full global context for org: ${organizationId}`);
        globalContext = await gatherGlobalContext(organizationId, uid);
      }

      // 4. Generate Intelligent Response using Gemini
      console.log(`🧠 [AI AGENT] Generating intelligent response with Gemini...`);
      const geminiService = createGeminiService();
      const currentMode = context?.activeMode || 'none';



      const agentResponse = await geminiService.generateAgentResponse(
        message,
        globalContext,
        currentMode
      );



      console.log(`✅ [AI AGENT] Response generated. Suggested context: ${agentResponse.suggestedContext}`);

      const response = {
        agentId,
        message,
        response: agentResponse.response,
        suggestedContext: agentResponse.suggestedContext,
        contextData: agentResponse.contextData,
        followUpSuggestions: agentResponse.followUpSuggestions,
        reasoning: agentResponse.reasoning,
        // NEW: Dialog system fields
        intent: agentResponse.intent,
        suggestedDialog: agentResponse.suggestedDialog,
        prefillData: agentResponse.prefillData,
        data: globalContext, // Include full context for debugging
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
    invoker: 'public',
    secrets: [geminiApiKey], // Add Gemini API key as required secret
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
      const uid = decodedToken.uid;

      if (!agentId || !message) {
        res.status(400).json(createErrorResponse('Invalid request', 'Agent ID and message are required'));
        return;
      }

      console.log(`🤖 [AI AGENT HTTP] Calling agent: ${agentId} for user: ${uid}`);

      // 1. Get User's Organization ID
      const userRecord = await auth.getUser(uid);
      const organizationId = userRecord.customClaims?.organizationId as string;

      if (!organizationId) {
        res.status(403).json(createErrorResponse('Forbidden', 'User does not belong to an organization'));
        return;
      }

      // 2. Quick Intent Detection (Optimization)
      const quickIntent = detectQuickIntent(message);
      console.log(`🎯 [AI AGENT HTTP] Quick intent detected: ${quickIntent}`);

      // 3. Gather Context (Optimized based on intent)
      let globalContext;
      if (quickIntent === 'graph') {
        console.log(`⚡ [AI AGENT HTTP] Using minimal context for graph request (optimization)`);
        globalContext = await gatherMinimalContextForGraph(organizationId, uid);
      } else {
        console.log(`📊 [AI AGENT HTTP] Gathering full global context for org: ${organizationId}`);
        globalContext = await gatherGlobalContext(organizationId, uid);
      }

      // 4. Generate Intelligent Response using Gemini
      console.log(`🧠 [AI AGENT HTTP] Generating intelligent response with Gemini...`);
      const geminiService = createGeminiService();
      const currentMode = context?.activeMode || 'none';

      const agentResponse = await geminiService.generateAgentResponse(
        message,
        globalContext,
        currentMode
      );

      console.log(`✅ [AI AGENT HTTP] Response generated. Suggested context: ${agentResponse.suggestedContext}`);

      const response = {
        agentId,
        message,
        response: agentResponse.response,
        suggestedContext: agentResponse.suggestedContext,
        contextData: agentResponse.contextData,
        followUpSuggestions: agentResponse.followUpSuggestions,
        reasoning: agentResponse.reasoning,
        // NEW: Dialog system fields
        intent: agentResponse.intent,
        suggestedDialog: agentResponse.suggestedDialog,
        prefillData: agentResponse.prefillData,
        data: globalContext,
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
