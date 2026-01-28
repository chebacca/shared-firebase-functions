"use strict";
/**
 * Planning Agent
 *
 * Specialized agent for workflow planning and orchestration.
 * Integrates with WorkflowOrchestrator for complex multi-step plans.
 * Uses workflow-related tools and planning capabilities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningAgent = void 0;
class PlanningAgent {
    ollamaService;
    toolRegistry;
    workflowTools = [];
    constructor(ollamaService, toolRegistry) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        // Initialize tools asynchronously (will be ready by first use)
        this.initializeWorkflowTools().catch(err => {
            console.error('[PlanningAgent] ⚠️ Failed to initialize workflow tools:', err);
        });
    }
    /**
     * Initialize list of workflow/planning tools
     */
    async initializeWorkflowTools() {
        const allTools = await this.toolRegistry.getAllTools();
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
    async createPlan(userRequest, context) {
        console.log(`[PlanningAgent] 📋 Creating plan: ${userRequest.substring(0, 100)}...`);
        // Ensure tools are initialized
        if (this.workflowTools.length === 0) {
            await this.initializeWorkflowTools();
        }
        const messages = [
            {
                role: 'user',
                content: this.buildPlanningPrompt(userRequest)
            }
        ];
        const response = await this.ollamaService.generateChatResponse(messages, this.workflowTools, context);
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
    buildPlanningPrompt(request) {
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
    extractPlanSteps(planText) {
        const steps = [];
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
    static isPlanningIntent(request) {
        const planningKeywords = [
            'plan', 'workflow', 'schedule', 'orchestrate',
            'steps', 'process', 'procedure', 'sequence',
            'create workflow', 'build plan', 'organize'
        ];
        const lowerRequest = request.toLowerCase();
        return planningKeywords.some(keyword => lowerRequest.includes(keyword));
    }
}
exports.PlanningAgent = PlanningAgent;
