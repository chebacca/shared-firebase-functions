/**
 * Action Execution Agent
 * 
 * Specialized agent for write operations (CRUD).
 * Requires confirmation/validation for destructive actions.
 * Uses create/update/delete/approve tools.
 */

import { OllamaToolCallingService } from '../services/OllamaToolCallingService';
import { UnifiedToolRegistry } from '../services/UnifiedToolRegistry';
import { ChatMessage } from '../services/OllamaToolCallingService';

export interface ActionContext {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    requireConfirmation?: boolean; // For destructive actions
}

export class ActionExecutionAgent {
    private ollamaService: OllamaToolCallingService;
    private toolRegistry: UnifiedToolRegistry;
    private actionTools: string[] = [];
    private destructiveTools: Set<string> = new Set();

    constructor(
        ollamaService: OllamaToolCallingService,
        toolRegistry: UnifiedToolRegistry
    ) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        // Initialize tools asynchronously (will be ready by first use)
        this.initializeActionTools().catch(err => {
            console.error('[ActionExecutionAgent] ⚠️ Failed to initialize action tools:', err);
        });
    }

    /**
     * Initialize list of action tools
     */
    private async initializeActionTools(): Promise<void> {
        const allTools = await this.toolRegistry.getAllTools();
        
        allTools.forEach(tool => {
            const name = tool.name.toLowerCase();
            if (name.includes('create') ||
                name.includes('update') ||
                name.includes('delete') ||
                name.includes('approve') ||
                name.includes('reject') ||
                name.includes('submit') ||
                name.includes('assign') ||
                name.includes('modify')) {
                this.actionTools.push(tool.name);

                // Mark destructive actions
                if (name.includes('delete') ||
                    name.includes('remove') ||
                    name.includes('revoke') ||
                    name.includes('cancel')) {
                    this.destructiveTools.add(tool.name);
                }
            }
        });

        console.log(`[ActionExecutionAgent] 🔨 Initialized with ${this.actionTools.length} action tools`);
        console.log(`[ActionExecutionAgent] ⚠️ ${this.destructiveTools.size} destructive tools require confirmation`);
    }

    /**
     * Execute an action
     */
    async executeAction(
        userRequest: string,
        context: ActionContext
    ): Promise<{
        answer: string;
        toolsUsed: string[];
        requiresConfirmation: boolean;
        data: any;
    }> {
        console.log(`[ActionExecutionAgent] 🔨 Executing action: ${userRequest.substring(0, 100)}...`);

        // Ensure tools are initialized
        if (this.actionTools.length === 0) {
            await this.initializeActionTools();
        }

        // Check if request involves destructive actions
        const requiresConfirmation = this.checkRequiresConfirmation(userRequest);

        const messages: ChatMessage[] = [
            {
                role: 'user',
                content: this.buildActionPrompt(userRequest, requiresConfirmation)
            }
        ];

        const response = await this.ollamaService.generateChatResponse(
            messages,
            this.actionTools,
            context
        );

        return {
            answer: response.message,
            toolsUsed: [], // Track in future
            requiresConfirmation,
            data: response
        };
    }

    /**
     * Check if action requires confirmation
     */
    private checkRequiresConfirmation(request: string): boolean {
        const destructiveKeywords = ['delete', 'remove', 'revoke', 'cancel', 'destroy'];
        const lowerRequest = request.toLowerCase();
        return destructiveKeywords.some(keyword => lowerRequest.includes(keyword));
    }

    /**
     * Build action prompt with safety instructions
     */
    private buildActionPrompt(request: string, requiresConfirmation: boolean): string {
        let prompt = `User request: ${request}\n\n`;

        if (requiresConfirmation) {
            prompt += `⚠️ WARNING: This action may be destructive. Please confirm the exact action before proceeding.\n\n`;
        }

        prompt += `Execute the requested action using the available tools. `;
        prompt += `Always verify organizationId and projectId match the user's context. `;
        prompt += `Return a clear confirmation of what was done.`;

        return prompt;
    }

    /**
     * Check if a request is appropriate for this agent
     */
    static isActionIntent(request: string): boolean {
        const actionKeywords = [
            'create', 'add', 'new', 'make', 'build',
            'update', 'edit', 'modify', 'change', 'set',
            'delete', 'remove', 'cancel', 'revoke',
            'approve', 'reject', 'submit', 'assign'
        ];

        const lowerRequest = request.toLowerCase();
        return actionKeywords.some(keyword => lowerRequest.includes(keyword));
    }
}
