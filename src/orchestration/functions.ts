import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { WorkflowOrchestrator } from './WorkflowOrchestrator';
import { traceFunction } from '../observability/tracer';
import { captureException, setUserContext } from '../observability/sentry';
// HumanMessage will be available at runtime if langchain is installed

const auth = getAuth();

export const executeOrchestrationWorkflow = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: true,
    timeoutSeconds: 540, // 9 minutes
    memory: '1GiB'
  },
  async (request) => {
    return traceFunction('orchestration.execute', async () => {
      try {
        const uid = request.auth?.uid;
        if (!uid) {
          throw new HttpsError('unauthenticated', 'User must be authenticated');
        }
        
        const userRecord = await auth.getUser(uid);
        const organizationId = userRecord.customClaims?.organizationId as string;
        
        if (!organizationId) {
          throw new HttpsError('failed-precondition', 'User does not belong to an organization');
        }
        
        setUserContext(uid, userRecord.email, organizationId);
        
        const { messages, context } = request.data;
        
        if (!messages || !Array.isArray(messages)) {
          throw new HttpsError('invalid-argument', 'Messages array is required');
        }
        
        // Check if this is architect/plan mode
        const isPlanMode = context?.activeMode === 'plan_mode';
        const conversationHistory = context?.conversationHistory || [];
        
        // IMPORTANT: If in plan mode, we should coordinate with architect
        // The architect builds the plan, orchestration executes it
        // For now, orchestration can work alongside architect mode
        
        // Convert messages to LangChain format (if available)
        // Note: HumanMessage will be available at runtime if @langchain/core is installed
        const langchainMessages = messages.map((msg: any) => {
          try {
            const { HumanMessage } = require('@langchain/core/messages');
            if (msg.role === 'user' || msg.sender === 'user') {
              return new HumanMessage(msg.content || msg.text || msg.message);
            }
            return new HumanMessage(msg.content || msg.text || msg.message);
          } catch {
            // Fallback if langchain not installed
            return { content: msg.content || msg.text || msg.message, role: msg.role || 'user' };
          }
        });
        
        // Pass architect mode, conversation history, and project context to orchestrator
        const orchestratorContext = {
          ...(context || {}),
          isPlanMode,
          conversationHistory,
          activeMode: context?.activeMode || 'none',
          projectId: context?.projectId || null // Current project from Hub
        };
        
        const orchestrator = new WorkflowOrchestrator();
        const result = await orchestrator.executeWorkflow(
          langchainMessages,
          organizationId,
          uid,
          orchestratorContext
        );
        
        return {
          success: true,
          data: result
        };
      } catch (error: any) {
        captureException(error, {
          function: 'executeOrchestrationWorkflow',
          request: request.data
        });
        
        console.error('Orchestration error:', error);
        throw new HttpsError('internal', error.message || 'Workflow execution failed');
      }
    });
  }
);
