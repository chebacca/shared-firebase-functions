/**
 * Master Agent v2 - World-Class Agent System
 * 
 * Uses SupervisorAgent to route requests to specialized agents.
 * Integrates with UnifiedToolRegistry and OllamaToolCallingService.
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
export const masterAgentV2 = onCall(async (request) => {
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

    // Initialize services
    const ollamaService = new OllamaToolCallingService();
    const supervisorAgent = new SupervisorAgent(ollamaService, unifiedToolRegistry());

    // Check Ollama availability
    const isOllamaAvailable = await ollamaService.checkAvailability();
    if (!isOllamaAvailable) {
      console.warn('[MasterAgentV2] ⚠️ Ollama not available, falling back to basic response');
      return {
        success: false,
        response: 'Ollama service is not available. Please ensure Ollama is running and accessible.',
        agent: 'query' as const,
        routing: {
          agent: 'query',
          confidence: 0.5,
          reasoning: 'Ollama unavailable'
        },
        error: 'Ollama service unavailable'
      } as MasterAgentResponse;
    }

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

    // Route request through SupervisorAgent
    const result = await supervisorAgent.routeRequest(message, supervisorContext);

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
