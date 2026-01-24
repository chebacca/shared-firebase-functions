/**
 * Supervisor Agent
 * 
 * Routes user intents to the best specialized agent.
 * Uses Ollama (phi4-mini) for fast intent classification.
 * Coordinates DataQueryAgent, ActionExecutionAgent, PlanningAgent, and ReportGenerationAgent.
 */

import { OllamaToolCallingService } from '../services/OllamaToolCallingService';
import { UnifiedToolRegistry } from '../services/UnifiedToolRegistry';
import { DataQueryAgent } from './DataQueryAgent';
import { ActionExecutionAgent } from './ActionExecutionAgent';
import { PlanningAgent } from './PlanningAgent';
import { ReportGenerationAgent } from './ReportGenerationAgent';
import { ChatMessage } from '../services/OllamaToolCallingService';
import { ProjectData } from '../services/DocumentAnalysisService';

export type AgentType = 'query' | 'action' | 'planning' | 'report';

export interface SupervisorContext {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    sessionId?: string;
    projectData?: ProjectData; // For report generation
}

export interface RoutingDecision {
    agent: AgentType;
    confidence: number;
    reasoning: string;
}

export class SupervisorAgent {
    private ollamaService: OllamaToolCallingService;
    private toolRegistry: UnifiedToolRegistry;
    
    // Specialized agents
    private queryAgent: DataQueryAgent;
    private actionAgent: ActionExecutionAgent;
    private planningAgent: PlanningAgent;
    private reportAgent: ReportGenerationAgent;

    constructor(
        ollamaService: OllamaToolCallingService,
        toolRegistry: UnifiedToolRegistry
    ) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;

        // Initialize specialized agents
        this.queryAgent = new DataQueryAgent(ollamaService, toolRegistry);
        this.actionAgent = new ActionExecutionAgent(ollamaService, toolRegistry);
        this.planningAgent = new PlanningAgent(ollamaService, toolRegistry);
        this.reportAgent = new ReportGenerationAgent(ollamaService as any, toolRegistry);
    }

    /**
     * Route user request to appropriate agent
     */
    async routeRequest(
        userRequest: string,
        context: SupervisorContext
    ): Promise<{
        agent: AgentType;
        result: any;
        routing: RoutingDecision;
    }> {
        console.log(`[SupervisorAgent] 🎯 Routing request: ${userRequest.substring(0, 100)}...`);

        try {
            // Step 1: Classify intent
            const routing = await this.classifyIntent(userRequest);

            console.log(`[SupervisorAgent] ✅ Routed to ${routing.agent} agent (confidence: ${routing.confidence})`);

            // Step 2: Execute with appropriate agent
            let result: any;

            switch (routing.agent) {
                case 'query':
                    result = await this.queryAgent.executeQuery(userRequest, context);
                    break;

                case 'action':
                    result = await this.actionAgent.executeAction(userRequest, context);
                    break;

                case 'planning':
                    result = await this.planningAgent.createPlan(userRequest, context);
                    break;

                case 'report':
                    if (!context.projectData) {
                        throw new Error('Project data required for report generation');
                    }
                    result = await this.reportAgent.generateReport(
                        userRequest,
                        context.projectData,
                        context
                    );
                    break;

                default:
                    throw new Error(`Unknown agent type: ${routing.agent}`);
            }

            return {
                agent: routing.agent,
                result,
                routing
            };
        } catch (error: any) {
            // Re-throw all errors to let masterAgentV2 handle fallback logic
            // Don't catch and convert to responses here - let errors propagate
            console.error('[SupervisorAgent] ❌ Error in routeRequest, re-throwing for fallback:', error?.message || error);
            throw error;
        }
    }

    /**
     * Classify user intent using Ollama (phi4-mini for speed)
     */
    private async classifyIntent(userRequest: string): Promise<RoutingDecision> {
        // First, try rule-based classification (fast)
        const ruleBased = this.ruleBasedClassification(userRequest);
        if (ruleBased.confidence > 0.8) {
            return ruleBased;
        }

        // Fall back to LLM classification
        return this.llmBasedClassification(userRequest);
    }

    /**
     * Rule-based intent classification (fast, deterministic)
     */
    private ruleBasedClassification(userRequest: string): RoutingDecision {
        const lowerRequest = userRequest.toLowerCase();

        // Check for report intent
        if (ReportGenerationAgent.isReportIntent(userRequest)) {
            return {
                agent: 'report',
                confidence: 0.9,
                reasoning: 'Contains report/analytics keywords'
            };
        }

        // Check for query intent
        if (DataQueryAgent.isQueryIntent(userRequest)) {
            return {
                agent: 'query',
                confidence: 0.85,
                reasoning: 'Contains query/search keywords'
            };
        }

        // Check for action intent
        if (ActionExecutionAgent.isActionIntent(userRequest)) {
            return {
                agent: 'action',
                confidence: 0.85,
                reasoning: 'Contains action keywords (create/update/delete)'
            };
        }

        // Check for planning intent
        if (PlanningAgent.isPlanningIntent(userRequest)) {
            return {
                agent: 'planning',
                confidence: 0.85,
                reasoning: 'Contains workflow/planning keywords'
            };
        }

        // Default to query (safest)
        return {
            agent: 'query',
            confidence: 0.5,
            reasoning: 'Default fallback to query agent'
        };
    }

    /**
     * LLM-based intent classification (more accurate, slower)
     */
    private async llmBasedClassification(userRequest: string): Promise<RoutingDecision> {
        const classificationPrompt = `Classify this user request into one of these categories:
- query: User wants to find, search, get, or list information (read-only)
- action: User wants to create, update, delete, or modify something (write operation)
- planning: User wants to create a plan, workflow, or multi-step process
- report: User wants a report, analysis, summary, or analytics

User request: "${userRequest}"

Respond with ONLY a JSON object in this format:
{
  "agent": "query|action|planning|report",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

        const messages: ChatMessage[] = [
            {
                role: 'user',
                content: classificationPrompt
            }
        ];

        try {
            const response = await this.ollamaService.generateChatResponse(messages, []);

            // Parse JSON from response
            const jsonMatch = response.message.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    agent: parsed.agent || 'query',
                    confidence: parsed.confidence || 0.7,
                    reasoning: parsed.reasoning || 'LLM classification'
                };
            }
        } catch (error: any) {
            // If Ollama error during classification, re-throw to trigger fallback
            const errorMessage = error?.message || String(error);
            if (errorMessage.includes('Ollama') || errorMessage.includes('ollama')) {
                console.error('[SupervisorAgent] ❌ Ollama error during classification, re-throwing for fallback:', errorMessage);
                throw error; // Re-throw to trigger Gemini fallback
            }
            console.warn('[SupervisorAgent] ⚠️ LLM classification failed (non-Ollama error), using rule-based:', error);
        }

        // Fallback to rule-based
        return this.ruleBasedClassification(userRequest);
    }

    /**
     * Get all available agents
     */
    getAvailableAgents(): AgentType[] {
        return ['query', 'action', 'planning', 'report'];
    }
}
