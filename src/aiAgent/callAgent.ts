/**
 * 🔥 CALL AI AGENT
 * Call AI agent with a message
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import { gatherGlobalContext, gatherMinimalContextForGraph } from '../ai/contextAggregation/GlobalContextService';
import { createGeminiService, geminiApiKey } from '../ai/GeminiService';

const auth = getAuth();

// CORS allowed origins for AI Agent functions
const CORS_ORIGINS = [
  'http://localhost:4001',
  'http://localhost:4002',
  'http://localhost:4003',
  'http://localhost:4004',
  'http://localhost:4005', // CNS
  'http://localhost:4006',
  'http://localhost:4007',
  'http://localhost:4009',
  'http://localhost:4010',
  'http://localhost:4011',
  'http://localhost:5201', // Deliverables
  'http://localhost:5173', // Bridge
  'https://backbone-client.web.app',
  'https://backbone-logic.web.app',
  'https://backbone-callsheet-standalone.web.app',
  'https://clipshowpro.web.app',
  'https://dashboard-1c3a5.web.app',
];

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
    region: 'us-central1',
    invoker: 'public', // Required for CORS preflight requests
    cors: true, // Set to true to bypass whitelist issues in production
    secrets: [geminiApiKey], // Add Gemini API key as required secret
  },
  async (request) => {
    try {
      console.log('🦄 UNICORN DEBUG: Real Gemini Service Active - Build Verified');
      console.log('🔐 [AI AGENT] Auth check:', {
        hasAuth: !!request.auth,
        uid: request.auth?.uid,
        email: request.auth?.token?.email,
        hasToken: !!request.auth?.token
      });

      const { agentId, message, context } = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        console.error('❌ [AI AGENT] No authenticated user found in request');
        console.error('   request.auth:', request.auth);
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      if (!agentId || !message) {
        throw new HttpsError('invalid-argument', 'Agent ID and message are required');
      }

      console.log(`🤖 [AI AGENT] Calling agent: ${agentId} for user: ${uid}`);

      // 1. Get User's Organization ID
      const userRecord = await auth.getUser(uid);
      const organizationId = userRecord.customClaims?.organizationId as string;



      if (!organizationId) {
        throw new HttpsError('failed-precondition', 'User does not belong to an organization');
      }

      // 2. Quick Intent Detection (Optimization)
      const quickIntent = detectQuickIntent(message);
      console.log(`🎯 [AI AGENT] Quick intent detected: ${quickIntent}`);

      // 3. Gather Context (Optimized based on intent)
      // Extract sessionId from context if provided (for workflow creation)
      const sessionId = context?.sessionId || context?.session?.id;

      let globalContext;
      if (quickIntent === 'graph') {
        console.log(`⚡ [AI AGENT] Using minimal context for graph request (optimization)`);
        globalContext = await gatherMinimalContextForGraph(organizationId, uid);
      } else {
        console.log(`📊 [AI AGENT] Gathering full global context for org: ${organizationId}${sessionId ? ` (session: ${sessionId})` : ''}`);
        globalContext = await gatherGlobalContext(organizationId, uid, sessionId);
      }

      // Ensure userId is set in globalContext
      if (!globalContext.userId) {
        globalContext.userId = uid;
      }

      // NEW: Pass explicit workflow action intent to global context
      if (context?.workflowAction) {
        (globalContext as any).workflowAction = context.workflowAction;
      }

      // 4. Generate Intelligent Response using Gemini
      console.log(`🧠 [AI AGENT] Generating intelligent response with Gemini...`);
      const geminiService = createGeminiService();
      const currentMode = context?.activeMode || 'none';

      // Check if function calling mode is enabled for workflows
      const useFunctionCalling = context?.useFunctionCalling === true && currentMode === 'workflows';

      // Extract attachments
      const attachments = [];
      if (context?.attachmentUrl && context?.attachmentMimeType) {
        attachments.push({
          url: context.attachmentUrl,
          mimeType: context.attachmentMimeType
        });
      }

      let agentResponse;
      if (useFunctionCalling) {
        console.log('🔧 [AI AGENT] Using function calling mode for workflow generation');
        agentResponse = await geminiService.generateWorkflowResponseWithFunctions(
          message,
          globalContext,
          context?.conversationHistory || [],
          context?.maxTurns || 5,
          attachments
        );
      } else {
        agentResponse = await geminiService.generateAgentResponse(
          message,
          globalContext,
          currentMode,
          attachments
        );
      }



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
        // NEW: Workflow generation fields
        workflowData: agentResponse.workflowData || (agentResponse.contextData?.workflowData ? {
          nodes: agentResponse.contextData.workflowData.nodes,
          edges: agentResponse.contextData.workflowData.edges,
          name: agentResponse.contextData.workflowData.name,
          description: agentResponse.contextData.workflowData.description
        } : undefined),
        // NEW: Function calling results
        functionResults: agentResponse.contextData?.functionResults,
        data: globalContext, // Include full context for debugging
        timestamp: new Date().toISOString()
      };



      return createSuccessResponse(response, 'AI agent called successfully');

    } catch (error: any) {
      const errorAgentId = request.data?.agentId;
      const errorOrgId = request.auth ? (await auth.getUser(request.auth.uid).catch(() => null))?.customClaims?.organizationId : null;
      console.error('❌ [AI AGENT] Error calling agent:', error);
      console.error('❌ [AI AGENT] Error stack:', error.stack);
      console.error('❌ [AI AGENT] Error details:', {
        message: error.message,
        name: error.name,
        code: error.code,
        agentId: errorAgentId,
        organizationId: errorOrgId,
        hasContext: !!request.data?.context
      });
      return createErrorResponse(
        error.message || 'Failed to call AI agent',
        error.stack
      );
    }
  }
);
