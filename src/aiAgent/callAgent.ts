/**
 * 🔥 CALL AI AGENT
 * Call AI agent with a message
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import { gatherGlobalContext, gatherMinimalContextForGraph } from '../ai/contextAggregation/GlobalContextService';
import { createGeminiService, geminiApiKey } from '../ai/GeminiService';
import { traceFunction, addSpanAttribute } from '../observability/tracer';
import { captureException, setUserContext } from '../observability/sentry';

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
 * Internal handler for Call AI agent
 */
export async function callAIAgentInternal(request: any) {
  return traceFunction('callAIAgent', async () => {
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

      addSpanAttribute('agent.id', agentId);
      addSpanAttribute('user.id', uid);
      addSpanAttribute('message.length', message?.length || 0);

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

      // Set user context for Sentry
      setUserContext(uid, userRecord.email, organizationId);
      addSpanAttribute('organization.id', organizationId);

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

      // NEW: Pass conversation history to globalContext for Architect mode
      if (context?.conversationHistory && Array.isArray(context.conversationHistory)) {
        (globalContext as any).conversationHistory = context.conversationHistory.map((msg: any) => ({
          role: msg.role || (msg.sender === 'user' ? 'user' : 'assistant'),
          content: msg.content || msg.text || msg.message
        }));
      }

      // NEW: Pass activeMode to globalContext for Architect mode routing
      const currentMode = context?.activeMode || 'none';
      (globalContext as any).activeMode = currentMode;
      console.log(`🎯 [AI AGENT] Active mode set to: ${currentMode}`);

      // NEW: Pass current projectId from Hub context (user's selected project after login)
      const currentProjectId = context?.projectId || null;
      if (currentProjectId) {
        (globalContext as any).currentProjectId = currentProjectId;
        console.log(`📁 [AI AGENT] Current project context: ${currentProjectId}`);
      }

      // NEW: Pass projectData for report generation
      if (context?.projectData) {
        (globalContext as any).projectData = context.projectData;
      }

      console.log(`🎯 [AI AGENT] Context received:`, JSON.stringify(context, null, 2));

      // 4. Route to Supervisor Agent (NEW ARCHITECTURE)
      // 
      // LLM Selection Strategy:
      // - Supervisor (Ollama) as DEFAULT: Cost-effective for data queries, actions, reports, general tasks
      // - Gemini for CREATIVE WRITING: Superior quality for script writing and planning
      //
      // Research (2026): Gemini significantly outperforms Ollama/Qwen for creative writing:
      // - Gemini-3-pro ranks #1 in creative writing benchmarks (score: 1490)
      // - Ollama/Qwen models are "all-rounders" but lack specialized refinement
      // - Professional script writing requires nuanced understanding and style adaptation
      //
      // Modes that require Gemini for creative writing quality:
      // - plan_mode: Architect planning requires superior reasoning and multi-step planning
      // - script: Script writing requires creative writing quality (Gemini outperforms Ollama/Qwen)
      // - scripting: Script editing/refinement requires creative writing quality
      //
      // Note: Clipsy Agent in Clip Show Pro also uses Gemini (preferredProvider: 'gemini')
      // for script writing, confirming this approach.

      let useSupervisor = process.env.USE_SUPERVISOR_AGENT !== 'false'; // Default to true

      const geminiOnlyModes = ['plan_mode', 'script', 'scripting'];
      const requiresGemini = geminiOnlyModes.includes(currentMode);

      let agentResponse: any;

      if (useSupervisor && !requiresGemini) {
        // NEW: Use Supervisor Agent with Ollama + UnifiedToolRegistry
        // Use Ollama for data queries, actions, reports, and general tasks (cost-effective)
        // Gemini reserved for creative writing tasks where quality is critical
        console.log(`🎯 [AI AGENT] Using Supervisor Agent with Ollama + UnifiedToolRegistry (mode: ${currentMode})`);

        try {
          const { SupervisorAgent } = await import('../ai/agents/SupervisorAgent');
          const { OllamaToolCallingService } = await import('../ai/services/OllamaToolCallingService');
          const { unifiedToolRegistry } = await import('../ai/services/UnifiedToolRegistry');
          const { agentMemoryService } = await import('../ai/services/AgentMemoryService');

          // Initialize services
          const toolRegistry = unifiedToolRegistry();
          const ollamaService = new OllamaToolCallingService(undefined, toolRegistry);
          const supervisor = new SupervisorAgent(ollamaService, toolRegistry);

          // Retrieve relevant memory
          const recentConversations = await agentMemoryService.getRecentConversations(uid, organizationId, 5);
          const memory = recentConversations.flatMap(c => c.messages);
          const memoryContext = memory.length > 0 ? {
            previousConversations: memory.slice(-5).map(m => ({
              role: m.role,
              content: m.content
            }))
          } : {};

          // Route request
          const supervisorResult = await supervisor.routeRequest(message, {
            userId: uid,
            organizationId,
            projectId: context?.projectId || globalContext.currentProjectId,
            sessionId: context?.sessionId,
            projectData: globalContext.projectData
          });

          // Format response
          agentResponse = {
            response: supervisorResult.result.answer || supervisorResult.result.message || 'Request processed',
            suggestedContext: currentMode,
            contextData: {
              agent: supervisorResult.agent,
              routing: supervisorResult.routing,
              toolsUsed: supervisorResult.result.toolsUsed || [],
              ...supervisorResult.result.data
            },
            followUpSuggestions: [],
            reasoning: supervisorResult.routing.reasoning
          };

          // Store conversation
          await agentMemoryService.saveConversation({
            userId: uid,
            organizationId,
            projectId: context?.projectId || globalContext.currentProjectId,
            messages: [
              { role: 'user', content: message, timestamp: new Date() },
              { role: 'assistant', content: agentResponse.response, timestamp: new Date() }
            ]
          });

          console.log(`✅ [AI AGENT] Supervisor routed to ${supervisorResult.agent} agent`);
        } catch (supervisorError: any) {
          console.error('❌ [AI AGENT] Supervisor routing failed, falling back to Gemini:', supervisorError);
          // Fall through to Gemini fallback
          useSupervisor = false;
        }
      }

      // Use Gemini for creative writing modes (plan_mode, script, scripting) or if supervisor fails
      if (requiresGemini || !useSupervisor || !agentResponse) {
        const reason = requiresGemini
          ? `creative writing mode (${currentMode}) - Gemini provides superior quality for script writing and planning`
          : 'legacy mode or supervisor unavailable';
        console.log(`🧠 [AI AGENT] Using Gemini (${reason})...`);
        const geminiService = createGeminiService();

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

      // Capture error in Sentry
      captureException(error, {
        function: 'callAIAgent',
        agentId: errorAgentId,
        organizationId: errorOrgId,
        hasContext: !!request.data?.context
      });

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
  }, {
    'function.name': 'callAIAgent',
    'function.type': 'ai-agent'
  });
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
    memory: '1GiB', // Increased memory to handle report generation dependencies
    timeoutSeconds: 300 // Match report generation timeout
  },
  callAIAgentInternal
);
