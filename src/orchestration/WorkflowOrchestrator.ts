// Conditional imports - LangGraph is optional
let StateGraph: any;
let START: any;
let END: any;
let BaseMessage: any;
let HumanMessage: any;

try {
  const langgraph = require('@langchain/langgraph');
  const langchain = require('@langchain/core/messages');
  StateGraph = langgraph.StateGraph;
  START = langgraph.START;
  END = langgraph.END;
  BaseMessage = langchain.BaseMessage;
  HumanMessage = langchain.HumanMessage;
} catch (e) {
  console.warn('⚠️ LangGraph packages not installed or fail to load. Orchestration disabled.', e);
}
import { traceFunction, addSpanAttribute } from '../observability/tracer';
import { captureException } from '../observability/sentry';
// Import services for actual implementation
import { gatherGlobalContext } from '../ai/contextAggregation/GlobalContextService';
import { createGeminiService } from '../ai/GeminiService';
import type { GlobalContext } from '../ai/contextAggregation/GlobalContextService';

export interface WorkflowState {
  messages: any[]; // BaseMessage[] when langchain is installed
  organizationId: string;
  userId: string;
  context: Record<string, any>;
  results: Record<string, any>;
  errors: Error[];
  // Plan Mode (Claude-style): read-only exploration → plan → human approval → execution
  isPlanning?: boolean;
  planPath?: string;
  waitingForApproval?: boolean;
}

export class WorkflowOrchestrator {
  private graph: any;

  constructor() {
    if (!StateGraph) {
      throw new Error('LangGraph not installed. Install langgraph and @langchain/core to use orchestration.');
    }
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    if (!StateGraph) {
      throw new Error('LangGraph not available');
    }
    const workflow = new StateGraph({
      channels: {
        messages: { reducer: (x: any[], y: any[]) => x.concat(y) },
        results: { reducer: (x: Record<string, any>, y: Record<string, any>) => ({ ...x, ...y }) },
        errors: { reducer: (x: Error[], y: Error[]) => x.concat(y) }
      }
    });

    // Add nodes for each orchestration step
    workflow.addNode("analyze", this.analyzeRequest.bind(this));
    workflow.addNode("architect_exploration", this.architectExploration.bind(this));
    workflow.addNode("query_notebooklm", this.queryNotebookLM.bind(this));
    workflow.addNode("execute_mcp_tools", this.executeMCPTools.bind(this));
    workflow.addNode("generate_response", this.generateResponse.bind(this));
    workflow.addNode("error_handler", this.handleError.bind(this));

    // Define edges
    workflow.addEdge(START, "analyze");
    workflow.addConditionalEdges(
      "analyze",
      this.routeAfterAnalysis.bind(this),
      {
        "plan": "architect_exploration",
        "notebooklm": "query_notebooklm",
        "mcp": "execute_mcp_tools",
        "error": "error_handler"
      }
    );
    workflow.addEdge("architect_exploration", "generate_response");
    workflow.addEdge("query_notebooklm", "generate_response");
    workflow.addEdge("execute_mcp_tools", "generate_response");
    workflow.addEdge("generate_response", END);
    workflow.addEdge("error_handler", END);

    // Plan mode: architect_exploration → generate_response (returns plan, waiting for approval).
    // Execution runs only when user sends "Proceed" with context.approvedPlanContent/approvedPlanActions.
    return workflow.compile();
  }

  private async analyzeRequest(state: WorkflowState): Promise<Partial<WorkflowState>> {
    return traceFunction('workflow.analyze', async () => {
      addSpanAttribute('workflow.step', 'analyze');
      addSpanAttribute('organization.id', state.organizationId);

      // Call MasterAgent to analyze request
      const analysis = await this.callMasterAgent(state);

      return {
        context: { ...state.context, analysis },
        results: { ...state.results, analysis }
      };
    });
  }

  /**
   * Architect Exploration node: read-only phase in Plan Mode.
   * Allows ls, read, grep, search only; rejects write/execute until plan is written to _plans/CURRENT_PLAN.md.
   * Returns plan in state and leads to generate_response (human approval required before execute_mcp_tools).
   */
  private async architectExploration(state: WorkflowState): Promise<Partial<WorkflowState>> {
    return traceFunction('workflow.architect_exploration', async () => {
      addSpanAttribute('workflow.step', 'architect_exploration');
      addSpanAttribute('organization.id', state.organizationId);

      try {
        const geminiService = createGeminiService();
        const globalContext = await gatherGlobalContext(state.organizationId, state.userId) as GlobalContext;
        (globalContext as any).activeMode = 'plan_mode';
        (globalContext as any).conversationHistory = state.context?.conversationHistory || [];
        (globalContext as any).currentProjectId = state.context?.projectId || null;

        const userMessage = state.messages[state.messages.length - 1];
        const messageText = typeof userMessage === 'string'
          ? userMessage
          : (userMessage as any)?.content ?? (userMessage as any)?.text ?? '';

        // EXPLORATION phase: read-only; plan written to _plans/CURRENT_PLAN.md conceptually (stored in results)
        const architectResponse = await geminiService.runArchitectSession(
          messageText,
          globalContext,
          [],
          'EXPLORATION'
        );

        const planPath = '_plans/CURRENT_PLAN.md';
        const planContent = architectResponse.contextData?.markdown ?? architectResponse.response ?? '';
        const actions = architectResponse.contextData?.actions ?? [];

        // Persist Plan to File System
        try {
          const fs = require('fs').promises;
          const path = require('path');

          // Ensure _plans directory exists
          const plansDir = path.resolve(process.cwd(), '_plans');
          await fs.mkdir(plansDir, { recursive: true });

          // Write plan file
          const absolutePlanPath = path.resolve(process.cwd(), planPath);
          await fs.writeFile(absolutePlanPath, planContent, 'utf-8');
          console.log(`💾 [WorkflowOrchestrator] Plan persisted to ${absolutePlanPath}`);
        } catch (fileError) {
          console.error('❌ [WorkflowOrchestrator] Failed to write plan file:', fileError);
          // Non-blocking error, we still have it in state
        }

        return {
          context: {
            ...state.context,
            isPlanning: false,
            planPath,
            waitingForApproval: true
          },
          results: {
            ...state.results,
            planPath,
            planContent,
            waitingForApproval: true,
            architectResponse,
            analysis: {
              ...state.results.analysis,
              architectResponse,
              actions: [], // Do not execute yet; wait for approval
              planContent,
              waitingForApproval: true
            }
          },
          isPlanning: false,
          planPath,
          waitingForApproval: true
        };
      } catch (error: any) {
        captureException(error, { step: 'architect_exploration', state });
        return {
          errors: [...state.errors, error],
          results: { ...state.results, error: error.message }
        };
      }
    });
  }

  private async queryNotebookLM(state: WorkflowState): Promise<Partial<WorkflowState>> {
    return traceFunction('workflow.notebooklm', async () => {
      addSpanAttribute('workflow.step', 'query_notebooklm');

      try {
        // Call NotebookLM service
        const notebookResults = await this.callNotebookLMService(state);

        return {
          results: { ...state.results, notebookLM: notebookResults }
        };
      } catch (error: any) {
        captureException(error, { step: 'query_notebooklm', state });
        return {
          errors: [...state.errors, error]
        };
      }
    });
  }

  private async executeMCPTools(state: WorkflowState): Promise<Partial<WorkflowState>> {
    return traceFunction('workflow.mcp_tools', async () => {
      addSpanAttribute('workflow.step', 'execute_mcp_tools');

      try {
        // Check for actions: approved plan (user said "Proceed") or architect-provided actions
        const analysis = state.results.analysis;
        const context = state.context || {};
        const architectActions =
          analysis?.actions?.length
            ? analysis.actions
            : (context.approvedPlanActions && context.approvedPlanActions.length > 0)
              ? context.approvedPlanActions
              : [];

        if (architectActions.length > 0) {
          console.log('🏛️ [WorkflowOrchestrator] Using actions from Architect plan');
          addSpanAttribute('workflow.actions.source', 'architect');
          addSpanAttribute('workflow.actions.count', architectActions.length);

          // Execute actions from architect plan
          const toolResults = await this.executeMCPActions(state, architectActions);

          return {
            results: {
              ...state.results,
              mcpTools: toolResults,
              executedActions: architectActions
            }
          };
        } else {
          // Execute MCP tools based on analysis (regular flow)
          console.log('🔄 [WorkflowOrchestrator] Executing MCP tools based on analysis');
          const toolResults = await this.executeMCPActions(state);

          return {
            results: { ...state.results, mcpTools: toolResults }
          };
        }
      } catch (error: any) {
        captureException(error, { step: 'execute_mcp_tools', state });
        return {
          errors: [...state.errors, error]
        };
      }
    });
  }

  private async generateResponse(state: WorkflowState): Promise<Partial<WorkflowState>> {
    return traceFunction('workflow.generate_response', async () => {
      addSpanAttribute('workflow.step', 'generate_response');

      // Combine all results and generate final response
      const response = await this.synthesizeResponse(state);

      return {
        results: { ...state.results, finalResponse: response }
      };
    });
  }

  private async handleError(state: WorkflowState): Promise<Partial<WorkflowState>> {
    const errors = state.errors;
    console.error('Workflow errors:', errors);

    errors.forEach(error => captureException(error, {
      workflow: 'orchestration',
      state
    }));

    return {
      results: {
        ...state.results,
        error: 'Workflow failed',
        details: errors.map(e => e.message)
      }
    };
  }

  private routeAfterAnalysis(state: WorkflowState): string {
    const analysis = state.results.analysis;
    const context = state.context || {};

    if (!analysis || state.errors.length > 0) {
      return "error";
    }

    // Plan mode: exploration phase (read-only) → architect_exploration; approval phase → execute_mcp_tools
    const isPlanMode = analysis.isPlanMode === true;
    const hasApprovedPlan = !!(context.approvedPlanContent || (context.approvedPlanActions && context.approvedPlanActions.length > 0));

    if (isPlanMode && !hasApprovedPlan) {
      return "plan"; // Architect Exploration: read-only, write PLAN.md, then stop for approval
    }
    if (isPlanMode && hasApprovedPlan) {
      return "mcp"; // User approved: execute using approved plan/actions
    }

    // Regular routing
    if (analysis.requiresDocumentKnowledge) {
      return "notebooklm";
    }
    if (analysis.requiresActions) {
      return "mcp";
    }

    return "error";
  }

  async executeWorkflow(
    messages: any[],
    organizationId: string,
    userId: string,
    context: Record<string, any> = {}
  ): Promise<WorkflowState> {
    const initialState: WorkflowState = {
      messages,
      organizationId,
      userId,
      context,
      results: {},
      errors: []
    };

    return traceFunction('workflow.execute', async () => {
      addSpanAttribute('workflow.type', 'orchestration');
      addSpanAttribute('organization.id', organizationId);
      addSpanAttribute('user.id', userId);

      const result = await this.graph.invoke(initialState);
      return result;
    });
  }

  // Integrated with existing GeminiService and Architect mode
  private async callMasterAgent(state: WorkflowState): Promise<any> {
    return traceFunction('workflow.callMasterAgent', async () => {
      try {
        // Get the user's message from state
        const userMessage = state.messages[state.messages.length - 1];
        const messageText = typeof userMessage === 'string'
          ? userMessage
          : (userMessage as any)?.content || (userMessage as any)?.text || '';

        // Check if in architect/plan mode
        const isPlanMode = state.context?.activeMode === 'plan_mode';
        const conversationHistory = state.context?.conversationHistory || [];

        // Gather global context (same as callAIAgent does)
        const globalContext: GlobalContext = await gatherGlobalContext(
          state.organizationId,
          state.userId
        );

        // Add architect mode, conversation history, and current project context
        (globalContext as any).activeMode = state.context?.activeMode || 'none';
        (globalContext as any).conversationHistory = conversationHistory;

        // CRITICAL: Add current projectId from Hub context (user's selected project after login)
        const currentProjectId = state.context?.projectId || null;
        if (currentProjectId) {
          (globalContext as any).currentProjectId = currentProjectId;
          console.log(`📁 [WorkflowOrchestrator] Current project context: ${currentProjectId}`);
        }

        // Use GeminiService for analysis (same as callAIAgent)
        const geminiService = createGeminiService();
        const currentMode = (state.context?.activeMode as any) || 'none';

        // Plan mode: exploration (read-only) vs execution (user approved)
        const approvedPlanActions = state.context?.approvedPlanActions;
        const isApprovalMessage = /^(proceed|approve|go ahead|execute|run it|looks good)/i.test(messageText.trim());

        if (isPlanMode && approvedPlanActions && approvedPlanActions.length > 0 && isApprovalMessage) {
          // User approved plan: route to execute_mcp_tools with approved actions
          console.log('🏛️ [WorkflowOrchestrator] Plan approved – routing to execution');
          return {
            requiresDocumentKnowledge: false,
            requiresActions: true,
            isPlanMode: true,
            actions: approvedPlanActions
          };
        }

        if (isPlanMode && !state.context?.approvedPlanContent) {
          // Exploration phase: route to architect_exploration (read-only); do not call Gemini here
          console.log('🏛️ [WorkflowOrchestrator] Plan mode – routing to Architect Exploration (read-only)');
          return {
            requiresDocumentKnowledge: false,
            requiresActions: true,
            isPlanMode: true,
            actions: []
          };
        }

        // Regular analysis using generateAgentResponse
        const agentResponse = await geminiService.generateAgentResponse(
          messageText,
          globalContext,
          currentMode,
          []
        );

        // Analyze the response to determine routing
        const responseText = agentResponse.response.toLowerCase();
        const requiresDocumentKnowledge =
          responseText.includes('document') ||
          responseText.includes('knowledge base') ||
          responseText.includes('notebooklm') ||
          agentResponse.contextData?.suggestedContext === 'knowledge_base';

        const requiresActions =
          responseText.includes('create') ||
          responseText.includes('update') ||
          responseText.includes('delete') ||
          responseText.includes('assign') ||
          responseText.includes('report') ||
          responseText.includes('analyze') ||
          agentResponse.contextData?.intent;

        return {
          requiresDocumentKnowledge,
          requiresActions,
          isPlanMode: false,
          agentResponse: agentResponse
        };
      } catch (error: any) {
        console.error('❌ [WorkflowOrchestrator] Error calling MasterAgent:', error);
        captureException(error, { step: 'callMasterAgent', state });

        // Fallback to basic analysis
        return {
          requiresDocumentKnowledge: false,
          requiresActions: true,
          isPlanMode: false,
          error: error.message
        };
      }
    });
  }

  private async callNotebookLMService(state: WorkflowState): Promise<any> {
    // TODO: Implement NotebookLM service call
    return {};
  }

  private async executeMCPActions(state: WorkflowState, architectActions?: any[]): Promise<any> {
    return traceFunction('workflow.executeMCPActions', async () => {
      // If architect provided actions, use those
      if (architectActions && architectActions.length > 0) {
        console.log(`🏛️ [WorkflowOrchestrator] Executing ${architectActions.length} actions from Architect plan`);
        addSpanAttribute('workflow.actions.source', 'architect');
        addSpanAttribute('workflow.actions.count', architectActions.length);

        // Import executors (same as GeminiService uses)
        const { DataToolExecutor } = await import('../ai/DataToolExecutor');
        const { WorkflowFunctionExecutor } = await import('../ai/workflowFunctionExecutor');
        const { dataToolDeclarations } = await import('../ai/dataTools');

        // Execute each action from the architect plan
        // CRITICAL: Store results from previous actions to pass to dependent actions
        const results = [];
        const actionResults: Record<string, any> = {}; // Store results keyed by action type and common IDs

        // CRITICAL: Add current project context from Hub (user's selected project after login)
        // This makes it available for variable resolution and auto-fill
        const currentProjectId = state.context?.projectId || null;
        if (currentProjectId) {
          actionResults['currentProjectId'] = currentProjectId;
          actionResults['projectId'] = currentProjectId; // Also available as $projectId for convenience
          console.log(`📁 [WorkflowOrchestrator] Current project context available: ${currentProjectId}`);
        }

        // Helper function to resolve variables in params (e.g., "$projectId" → actual projectId)
        const resolveVariables = (params: any, results: Record<string, any>): any => {
          if (!params || typeof params !== 'object') return params;

          const resolved = { ...params };
          for (const [key, value] of Object.entries(resolved)) {
            if (typeof value === 'string' && value.startsWith('$')) {
              // Variable reference like "$projectId" or "$create_project_id"
              const varName = value.substring(1);
              if (results[varName] !== undefined) {
                resolved[key] = results[varName];
                console.log(`🔄 [WorkflowOrchestrator] Resolved ${key}: ${value} → ${results[varName]}`);
              } else {
                console.warn(`⚠️ [WorkflowOrchestrator] Variable ${value} not found in results`);
              }
            } else if (typeof value === 'object' && value !== null) {
              // Recursively resolve nested objects
              resolved[key] = resolveVariables(value, results);
            }
          }
          return resolved;
        };

        for (const action of architectActions) {
          try {
            addSpanAttribute(`workflow.action.${action.type}`, 'executing');

            // Resolve variables in action params using results from previous actions
            let resolvedParams = resolveVariables(action.params || {}, actionResults);

            // CRITICAL: If projectId is missing and we have currentProjectId from context, auto-fill it
            // This ensures project-related actions use the user's selected project from Hub
            if (!resolvedParams.projectId && state.context?.projectId) {
              resolvedParams = { ...resolvedParams, projectId: state.context.projectId };
              console.log(`📁 [WorkflowOrchestrator] Auto-filled projectId from context: ${state.context.projectId}`);
            }

            console.log(`🔄 [WorkflowOrchestrator] Action ${action.type} params:`, JSON.stringify(resolvedParams));

            // Determine which executor to use (same logic as GeminiService)
            const isDataTool = dataToolDeclarations.some((t: any) => t.name === action.type);

            let toolResult;
            if (isDataTool) {
              console.log(`⚙️ [WorkflowOrchestrator] Executing via DataToolExecutor: ${action.type}`);
              toolResult = await DataToolExecutor.executeTool(
                action.type,
                resolvedParams,
                state.organizationId,
                state.userId
              );
            } else {
              console.log(`⚙️ [WorkflowOrchestrator] Executing via WorkflowFunctionExecutor: ${action.type}`);
              toolResult = await WorkflowFunctionExecutor.executeFunction(
                action.type,
                resolvedParams,
                state.organizationId,
                state.userId
              );
            }

            if (toolResult.success) {
              addSpanAttribute(`workflow.action.${action.type}`, 'success');

              // Store result for subsequent actions
              const resultData = toolResult.data || {};

              // Store by action type
              actionResults[action.type] = resultData;

              // Store common ID patterns for easy reference
              if (resultData.id) {
                actionResults[`${action.type}_id`] = resultData.id;

                // Map common action types to common variable names
                if (action.type === 'create_project') {
                  actionResults['projectId'] = resultData.id;
                } else if (action.type === 'create_session') {
                  actionResults['sessionId'] = resultData.id;
                } else if (action.type === 'create_call_sheet') {
                  actionResults['callSheetId'] = resultData.id;
                } else if (action.type === 'create_script_package') {
                  actionResults['storyId'] = resultData.id;
                  actionResults['scriptId'] = resultData.id;
                } else if (action.type === 'create_workflow') {
                  actionResults['workflowId'] = resultData.id;
                } else if (action.type === 'create_delivery_package') {
                  actionResults['packageId'] = resultData.id;
                } else if (action.type === 'create_budget') {
                  actionResults['budgetId'] = resultData.id;
                }

                // Also store any other IDs that might be in the result
                if (resultData.projectId) actionResults['projectId'] = resultData.projectId;
                if (resultData.sessionId) actionResults['sessionId'] = resultData.sessionId;
                if (resultData.storyId) actionResults['storyId'] = resultData.storyId;
              }

              // Store full result data for complex lookups
              actionResults[`${action.type}_result`] = resultData;

              results.push({
                action: action.type,
                success: true,
                data: resultData,
                result: toolResult
              });
            } else {
              addSpanAttribute(`workflow.action.${action.type}`, 'failed');
              captureException(new Error(`Action ${action.type} failed: ${toolResult.error}`), {
                action: action.type,
                params: resolvedParams,
                toolResult
              });
              results.push({
                action: action.type,
                success: false,
                error: toolResult.error || 'Execution failed',
                data: toolResult.data
              });
            }
          } catch (error: any) {
            console.error(`❌ [WorkflowOrchestrator] Error executing action ${action.type}:`, error);
            captureException(error, {
              step: 'executeMCPActions',
              action: action.type,
              params: action.params
            });
            results.push({
              action: action.type,
              success: false,
              error: error.message || 'Unknown error'
            });
          }
        }

        return {
          executed: results,
          totalActions: architectActions.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        };
      }

      // Regular MCP tool execution (when no architect actions)
      // This would be based on analysis - for now return empty
      // TODO: Implement analysis-based tool execution if needed
      console.log('🔄 [WorkflowOrchestrator] No architect actions provided - would execute based on analysis');
      return {
        message: 'No actions to execute',
        executed: []
      };
    });
  }

  private async synthesizeResponse(state: WorkflowState): Promise<any> {
    // Combine results into final response
    const analysis = state.results.analysis;
    const results = state.results;

    // Plan mode: waiting for approval – return plan and approval state (human-in-the-loop)
    if (results.waitingForApproval && (results.planContent || results.planPath)) {
      const architectResponse = results.architectResponse;
      return {
        message: architectResponse?.response || 'Plan ready for your review. Approve to execute.',
        data: {
          ...results,
          architectPlan: results.planContent || architectResponse?.contextData?.markdown,
          planPath: results.planPath || '_plans/CURRENT_PLAN.md',
          planApprovalState: 'pending',
          requiresApproval: true,
          planContent: results.planContent,
          actions: architectResponse?.contextData?.actions || [],
          executedActions: results.executedActions || []
        }
      };
    }

    // If architect provided a response, use it
    if (analysis?.architectResponse) {
      const architectResponse = analysis.architectResponse;
      return {
        message: architectResponse.response || 'Workflow completed successfully',
        data: {
          ...state.results,
          architectPlan: architectResponse.contextData?.markdown,
          executedActions: state.results.executedActions || []
        }
      };
    }

    // If we have agent response, use it
    if (analysis?.agentResponse) {
      return {
        message: analysis.agentResponse.response || 'Workflow completed successfully',
        data: state.results
      };
    }

    // Default response
    return {
      message: 'Workflow completed successfully',
      data: state.results
    };
  }
}
