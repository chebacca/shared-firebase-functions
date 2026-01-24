/**
 * Planning Agent
 * 
 * Specialized agent for workflow planning and orchestration.
 * Integrates with WorkflowOrchestrator for complex multi-step plans.
 * Uses workflow-related tools and planning capabilities.
 */

import { OllamaToolCallingService } from '../services/OllamaToolCallingService';
import { UnifiedToolRegistry } from '../services/UnifiedToolRegistry';
import { ChatMessage } from '../services/OllamaToolCallingService';

export interface PlanningContext {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    sessionId?: string;
}

export class PlanningAgent {
    private ollamaService: OllamaToolCallingService;
    private toolRegistry: UnifiedToolRegistry;
    private workflowTools: string[] = [];

    constructor(
        ollamaService: OllamaToolCallingService,
        toolRegistry: UnifiedToolRegistry
    ) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        this.initializeWorkflowTools();
    }

    /**
     * Initialize list of workflow/planning tools
     */
    private initializeWorkflowTools(): void {
        const allTools = this.toolRegistry.getAllTools();
        this.workflowTools = allTools
            .filter(tool => {
                const name = tool.name.toLowerCase();
                return name.includes('workflow') ||
                    name.includes('plan') ||
                    name.includes('schedule') ||
                    name.includes('orchestrate') ||
                    name.includes('step') ||
                    name.includes('transition') ||
                    name.includes('script') ||
                    name.includes('breakdown') ||
                    name.includes('story');
            })
            .map(tool => tool.name);

        console.log(`[PlanningAgent] 📋 Initialized with ${this.workflowTools.length} workflow tools`);
    }

    /**
     * Create a plan for a complex request
     */
    async createPlan(
        userRequest: string,
        context: PlanningContext
    ): Promise<{
        plan: string;
        steps: string[];
        toolsUsed: string[];
        data: any;
    }> {
        console.log(`[PlanningAgent] 📋 Creating plan: ${userRequest.substring(0, 100)}...`);

        const messages: ChatMessage[] = [
            {
                role: 'user',
                content: this.buildPlanningPrompt(userRequest)
            }
        ];

        const response = await this.ollamaService.generateChatResponse(
            messages,
            this.workflowTools,
            context
        );

        // Parse plan from response
        const steps = this.extractPlanSteps(response.message);

        return {
            plan: response.message,
            steps,
            toolsUsed: [],
            data: response
        };
    }

    /**
     * Build planning prompt
     */
    private buildPlanningPrompt(request: string): string {
        return `User request: ${request}

Create a detailed plan to accomplish this request. Break it down into clear steps.
Consider dependencies, prerequisites, and the order of operations.

For workflow-related requests, use workflow tools to create or modify workflows.
For multi-step processes, outline each step clearly.

Return a structured plan with numbered steps.`;
    }

    /**
     * Extract plan steps from response
     */
    private extractPlanSteps(planText: string): string[] {
        const steps: string[] = [];
        
        // Look for numbered steps (1., 2., etc.)
        const stepRegex = /^\d+[\.\)]\s*(.+)$/gm;
        let match;
        while ((match = stepRegex.exec(planText)) !== null) {
            steps.push(match[1].trim());
        }

        // Fallback: split by newlines if no numbered steps
        if (steps.length === 0) {
            const lines = planText.split('\n').filter(line => line.trim().length > 0);
            steps.push(...lines.slice(0, 10)); // Max 10 steps
        }

        return steps;
    }

    /**
     * Check if a request is appropriate for this agent
     */
    static isPlanningIntent(request: string): boolean {
        const planningKeywords = [
            'plan', 'workflow', 'schedule', 'orchestrate',
            'steps', 'process', 'procedure', 'sequence',
            'create workflow', 'build plan', 'organize'
        ];

        const lowerRequest = request.toLowerCase();
        return planningKeywords.some(keyword => lowerRequest.includes(keyword));
    }
}
