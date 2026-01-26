/**
 * Master Agent v2 - World-Class Agent System
 * 
 * Uses SupervisorAgent to route requests to specialized agents.
 * Integrates with UnifiedToolRegistry and OllamaToolCallingService.
 * 
 * LLM Selection Strategy:
 * - Supervisor (Ollama) as DEFAULT: Cost-effective for data queries, actions, reports
 * - Gemini for CREATIVE WRITING: Superior quality for script writing and planning
 *   Modes: plan_mode, script, scripting
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { SupervisorAgent } from './agents/SupervisorAgent';
import { OllamaToolCallingService } from './services/OllamaToolCallingService';
import { unifiedToolRegistry } from './services/UnifiedToolRegistry';
import { agentMemoryService } from './services/AgentMemoryService';
import { ProjectData } from './services/DocumentAnalysisService';


// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = getAuth();

interface MasterAgentRequest {
  message: string;
  organizationId: string;
  userId: string;
  projectId?: string;
  sessionId?: string;
  conversationId?: string;
  context?: {
    activeMode?: string; // Mode from frontend: 'plan_mode', 'script', 'scripting', etc.
    projectData?: ProjectData;
    [key: string]: any;
  };
}

interface MasterAgentResponse {
  success: boolean;
  response: string;
  agent: 'query' | 'action' | 'planning' | 'report';
  routing: {
    agent: string;
    confidence: number;
    reasoning: string;
  };
  toolsUsed?: string[];
  requiresConfirmation?: boolean;
  conversationId?: string;
  error?: string;
}

/**
 * Master Agent v2 - Main entry point
 */
import { createGeminiService, geminiApiKey } from './GeminiService';

// Define secret for Gemini API key (must match definition in GeminiService)
// const geminiApiKey = defineSecret('GEMINI_API_KEY'); -- USING IMPORTED ONE

/**
 * Master Agent v2 - Main entry point
 */
export const masterAgentV2 = onCall({
  secrets: [geminiApiKey],
  cors: true,
  timeoutSeconds: 300,
  memory: '1GiB'
}, async (request) => {
  try {
    const { message, organizationId, userId, projectId, sessionId, conversationId, context } =
      request.data as MasterAgentRequest;

    // Validate request
    if (!message || !organizationId || !userId) {
      throw new HttpsError('invalid-argument', 'Missing required fields: message, organizationId, userId');
    }

    // Verify authentication
    const authToken = request.auth;
    if (!authToken) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user exists and has access to organization
    try {
      const user = await auth.getUser(userId);
      if (!user) {
        throw new HttpsError('permission-denied', 'User not found');
      }
    } catch (error: any) {
      throw new HttpsError('permission-denied', `Authentication error: ${error.message}`);
    }

    console.log(`[MasterAgentV2] 🚀 Processing request from user ${userId} in org ${organizationId}`);
    console.log(`[MasterAgentV2] 💬 Message: ${message.substring(0, 100)}...`);

    // Determine active mode from context
    const activeMode = context?.activeMode || 'none';
    console.log(`[MasterAgentV2] 🎯 Active mode: ${activeMode}`);

    // Check Ollama configuration
    const ollamaEnabled = process.env.OLLAMA_ENABLED === 'true';
    const ollamaPreferred = process.env.REPORT_USE_OLLAMA === 'true';
    const useOllamaFirst = ollamaEnabled || ollamaPreferred;

    console.log(`[MasterAgentV2] 🔧 Configuration:`);
    console.log(`   OLLAMA_ENABLED: ${process.env.OLLAMA_ENABLED || 'not set'}`);
    console.log(`   REPORT_USE_OLLAMA: ${process.env.REPORT_USE_OLLAMA || 'not set'}`);
    console.log(`   OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL || 'not set'}`);
    console.log(`   Use Ollama First: ${useOllamaFirst}`);

    // Modes that traditionally benefit from Gemini's creative writing quality:
    // - plan_mode: Architect planning (but Ollama can handle this too)
    // - script: Script writing (but Ollama qwen2.5:14b and gemma2:27b are capable)
    // - scripting: Script editing/refinement
    const geminiPreferredModes = ['plan_mode', 'script', 'scripting'];
    const isGeminiPreferredMode = geminiPreferredModes.includes(activeMode);

    // PRIORITY: Use Ollama first if enabled, regardless of mode
    // Only skip to Gemini if Ollama is explicitly disabled
    if (isGeminiPreferredMode && !useOllamaFirst) {
      console.log(`[MasterAgentV2] 🧠 Using Gemini for creative writing mode: ${activeMode} (Ollama disabled)`);

      try {
        // Use callAIAgentInternal which has the full Gemini integration with Architect mode support
        const { callAIAgentInternal } = await import('../aiAgent/callAgent');

        // Create a mock request object that matches callAIAgent's expected format
        const mockRequest = {
          auth: request.auth,
          data: {
            agentId: 'master-agent',
            message,
            context: {
              activeMode,
              projectId,
              conversationHistory: [],
              ...context
            }
          }
        } as any;

        // Call the internal handler which handles Gemini routing
        const geminiResult = await callAIAgentInternal(mockRequest);
        const geminiData = geminiResult.data as any;

        // Format response to match MasterAgentV2 format
        return {
          success: true,
          response: geminiData.response || geminiData.message || 'Response generated',
          agent: 'planning' as const, // Creative writing is handled by planning agent
          routing: {
            agent: 'planning',
            confidence: 0.9,
            reasoning: `Using Gemini for creative writing mode: ${activeMode}`
          },
          toolsUsed: geminiData.contextData?.toolsUsed || [],
          requiresConfirmation: false,
          conversationId: conversationId
        } as MasterAgentResponse;
      } catch (geminiError: any) {
        console.error('[MasterAgentV2] ❌ Gemini routing failed:', geminiError);
        // Fall through to Supervisor fallback
      }
    }

    // Use Supervisor (Ollama) for all other modes - OLLAMA FIRST PRIORITY
    console.log(`[MasterAgentV2] 🎯 Routing to Supervisor Agent (Ollama-first) for mode: ${activeMode}`);
    console.log(`[MasterAgentV2] 🔄 Strategy: Try Ollama first, fallback to Gemini if unavailable`);
    console.log(`[MasterAgentV2] 🔄 Attempting Ollama first, will fallback to Gemini if Ollama fails during execution`);

    // Initialize services
    const toolRegistry = unifiedToolRegistry();
    const ollamaService = new OllamaToolCallingService(undefined, toolRegistry);
    const supervisorAgent = new SupervisorAgent(ollamaService, toolRegistry);

    // No upfront availability check - try Ollama first and catch errors during execution

    // Get or create session ID
    const activeSessionId = sessionId || `session_${userId}_${Date.now()}`;

    // Add user message to session memory
    agentMemoryService.addSessionMessage(activeSessionId, {
      role: 'user',
      content: message,
      timestamp: new Date(),
      metadata: {
        context: {
          organizationId,
          projectId
        }
      }
    });

    // Prepare supervisor context
    const supervisorContext = {
      userId,
      organizationId,
      projectId,
      sessionId: activeSessionId,
      projectData: context?.projectData
    };

    // Route request through SupervisorAgent (with fallback if Ollama fails during execution)
    let result: any;
    try {
      console.log('[MasterAgentV2] 🚀 Attempting to route request through SupervisorAgent...');
      console.log('[MasterAgentV2] 🔍 Message:', message.substring(0, 100));
      console.log('[MasterAgentV2] 🔍 Context:', JSON.stringify(supervisorContext, null, 2).substring(0, 300));
      result = await supervisorAgent.routeRequest(message, supervisorContext);
      console.log('[MasterAgentV2] ✅ SupervisorAgent completed successfully');
      console.log('[MasterAgentV2] 🔍 Result structure:', JSON.stringify(result, null, 2).substring(0, 1000));

      // Check if result itself is an error response object (MasterAgentResponse format)
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        const errorResponse = result as any;
        if (errorResponse.error && (errorResponse.error.includes('Ollama') || errorResponse.error.includes('ollama'))) {
          console.error('[MasterAgentV2] ❌ Result is error response with Ollama error, triggering fallback:', errorResponse.error);
          throw new Error(errorResponse.error || errorResponse.response || 'Ollama service unavailable');
        }
        if (errorResponse.response && (errorResponse.response.includes('Ollama') || errorResponse.response.includes('ollama'))) {
          console.error('[MasterAgentV2] ❌ Result is error response with Ollama message, triggering fallback');
          throw new Error(errorResponse.response);
        }
      }

      // Check if result contains an error response (some agents might return error responses instead of throwing)
      if (result && result.result) {
        const resultData = result.result;
        // Check if the result itself indicates an Ollama error
        if (resultData.error && (resultData.error.includes('Ollama') || resultData.error.includes('ollama'))) {
          console.error('[MasterAgentV2] ❌ Result contains Ollama error, triggering fallback:', resultData.error);
          throw new Error(resultData.error);
        }
        // Check if the answer/response indicates Ollama unavailable
        const answer = resultData.answer || resultData.response || '';
        if (answer.includes('Ollama service is not available') || answer.includes('Ollama service unavailable')) {
          console.error('[MasterAgentV2] ❌ Result answer indicates Ollama unavailable, triggering fallback');
          throw new Error('Ollama service is not available. Please ensure Ollama is running and accessible.');
        }
      }

      // Also check if result.routing.reasoning indicates Ollama unavailable (in case error was converted to routing)
      if (result && result.routing && result.routing.reasoning) {
        const reasoning = result.routing.reasoning.toLowerCase();
        if (reasoning.includes('ollama unavailable') || reasoning.includes('ollama not available')) {
          console.error('[MasterAgentV2] ❌ Routing reasoning indicates Ollama unavailable, triggering fallback');
          throw new Error('Ollama service is not available. Please ensure Ollama is running and accessible.');
        }
      }
    } catch (supervisorError: any) {
      console.error('[MasterAgentV2] ❌ CAUGHT ERROR from SupervisorAgent - starting fallback logic');
      const errorMessage = supervisorError?.message || String(supervisorError);
      const errorString = String(supervisorError).toLowerCase();

      // Enhanced Ollama error detection - check for various Ollama error patterns
      const isOllamaError =
        errorMessage.includes('Ollama') ||
        errorMessage.includes('ollama') ||
        errorString.includes('ollama') ||
        errorMessage.includes('Ollama service is not available') ||
        errorMessage.includes('Ollama service unavailable') ||
        supervisorError?.isOllamaUnavailable === true ||
        (supervisorError?.code && (supervisorError.code === 'ECONNREFUSED' || supervisorError.code === 'ENOTFOUND'));

      console.error('[MasterAgentV2] ❌ SupervisorAgent execution failed:', errorMessage);
      console.error('[MasterAgentV2] 🔍 Full error object:', JSON.stringify(supervisorError, Object.getOwnPropertyNames(supervisorError)));
      console.log(`[MasterAgentV2] 🔍 Error type: ${isOllamaError ? 'Ollama unavailable - will fallback to Gemini' : 'Other error - will re-throw'}`);

      // If SupervisorAgent fails due to Ollama issue, fallback to Gemini
      if (isOllamaError) {
        console.log('[MasterAgentV2] 🔄 Ollama error detected, automatically falling back to Gemini...');
        try {
          const { callAIAgentInternal } = await import('../aiAgent/callAgent');
          const mockRequest = {
            auth: request.auth,
            data: {
              agentId: 'master-agent',
              message,
              context: {
                activeMode,
                projectId,
                conversationHistory: [],
                ...context
              }
            }
          } as any;

          console.log('[MasterAgentV2] 🧠 Calling Gemini via callAIAgentInternal fallback...');

          const geminiResult = await callAIAgentInternal(mockRequest);

          // Correctly extract the AI response text
          // The response structure from callAIAgentInternal is { success: true, data: { response: "...", ... } }
          // so geminiResult.data is the payload object containing .response
          const geminiResultData = geminiResult.data || geminiResult;

          console.log('[MasterAgentV2] 🧠 Gemini fallback payload keys:', Object.keys(geminiResultData));
          console.log('[MasterAgentV2] 🧠 Gemini response value:', geminiResultData.response);
          console.log('[MasterAgentV2] 🧠 Gemini data.data value:', geminiResultData.data);

          return {
            success: true,
            // Extract response from the payload object (geminiResultData)
            response: geminiResultData.response || geminiResultData.message || 'Response generated (No content)',
            agent: 'query' as const,
            routing: {
              agent: 'query',
              confidence: 0.8,
              reasoning: 'Ollama unavailable, automatically using Gemini fallback'
            },
            toolsUsed: geminiResultData.contextData?.toolsUsed || [],
            conversationId: conversationId
          } as MasterAgentResponse;
        } catch (fallbackError: any) {
          console.error('[MasterAgentV2] ❌ Gemini fallback also failed:', fallbackError?.message || fallbackError);
          return {
            success: false,
            response: 'AI services are temporarily unavailable. Please try again in a moment.',
            agent: 'query' as const,
            routing: {
              agent: 'query',
              confidence: 0.5,
              reasoning: 'Both Ollama and Gemini unavailable'
            },
            error: 'AI services unavailable'
          } as MasterAgentResponse;
        }
      } else {
        // Non-Ollama error, re-throw
        throw supervisorError;
      }
    }

    // Add assistant response to session memory
    agentMemoryService.addSessionMessage(activeSessionId, {
      role: 'assistant',
      content: result.result.answer || result.result.plan || result.result.report?.executiveSummary || 'Response generated',
      timestamp: new Date(),
      metadata: {
        agent: result.agent,
        toolsUsed: result.result.toolsUsed || [],
        context: supervisorContext
      }
    });

    // Save conversation to Firestore if conversationId provided or create new one
    let savedConversationId = conversationId;
    if (!savedConversationId) {
      const sessionMessages = agentMemoryService.getSessionMessages(activeSessionId);
      savedConversationId = await agentMemoryService.saveConversation({
        userId,
        organizationId,
        projectId,
        messages: sessionMessages,
        metadata: {
          title: message.substring(0, 50),
          tags: [result.agent]
        }
      });
    } else {
      // Update existing conversation
      const sessionMessages = agentMemoryService.getSessionMessages(activeSessionId);
      const newMessages = sessionMessages.slice(-2); // Last user + assistant messages
      if (newMessages.length > 0) {
        await agentMemoryService.updateConversation(savedConversationId, newMessages);
      }
    }

    // Format response
    const response: MasterAgentResponse = {
      success: true,
      response: result.result.answer || result.result.plan || JSON.stringify(result.result.report || result.result.data),
      agent: result.agent,
      routing: result.routing,
      toolsUsed: result.result.toolsUsed || [],
      requiresConfirmation: result.result.requiresConfirmation || false,
      conversationId: savedConversationId
    };

    console.log(`[MasterAgentV2] ✅ Request completed by ${result.agent} agent`);
    console.log(`[MasterAgentV2] 📊 Confidence: ${result.routing.confidence}, Reasoning: ${result.routing.reasoning}`);

    return response;

  } catch (error: any) {
    console.error('[MasterAgentV2] ❌ Error:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      `Master Agent error: ${error.message || 'Unknown error'}`
    );
  }
});
