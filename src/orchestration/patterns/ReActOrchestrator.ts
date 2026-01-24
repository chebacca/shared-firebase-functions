/**
 * ReAct Orchestrator
 * 
 * Implements Reasoning-Action-Observation loops for agent workflows.
 * Enables agents to reason about problems, take actions, observe results, and iterate.
 * 
 * Pattern: THINK → ACT → OBSERVE → REPEAT (until answer found or max iterations)
 */

import { OllamaToolCallingService } from '../../ai/services/OllamaToolCallingService';
import { UnifiedToolRegistry } from '../../ai/services/UnifiedToolRegistry';
import { ChatMessage } from '../../ai/services/OllamaToolCallingService';

export interface ReActStep {
    iteration: number;
    thought: string;
    action?: {
        tool: string;
        arguments: Record<string, any>;
    };
    observation?: string;
    answer?: string;
}

export interface ReActResult {
    answer: string;
    steps: ReActStep[];
    iterations: number;
    success: boolean;
}

export class ReActOrchestrator {
    private ollamaService: OllamaToolCallingService;
    private toolRegistry: UnifiedToolRegistry;
    private maxIterations: number;

    constructor(
        ollamaService: OllamaToolCallingService,
        toolRegistry: UnifiedToolRegistry,
        maxIterations: number = 10
    ) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        this.maxIterations = maxIterations;
    }

    /**
     * Execute ReAct loop: Reasoning → Action → Observation
     */
    async execute(
        query: string,
        availableTools?: string[],
        context?: {
            userId?: string;
            organizationId?: string;
            projectId?: string;
        }
    ): Promise<ReActResult> {
        console.log(`[ReActOrchestrator] 🔄 Starting ReAct loop for: ${query.substring(0, 100)}...`);

        const steps: ReActStep[] = [];
        const conversationHistory: ChatMessage[] = [
            {
                role: 'system',
                content: this.buildSystemPrompt(availableTools)
            },
            {
                role: 'user',
                content: query
            }
        ];

        for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
            console.log(`[ReActOrchestrator] 🔄 Iteration ${iteration}/${this.maxIterations}`);

            // Step 1: THINK - Generate reasoning
            const thought = await this.generateThought(conversationHistory, iteration);
            steps.push({
                iteration,
                thought
            });

            // Check if we have a final answer
            if (this.hasFinalAnswer(thought)) {
                const answer = this.extractAnswer(thought);
                return {
                    answer: answer || 'No answer found',
                    steps,
                    iterations: iteration,
                    success: true
                };
            }

            // Step 2: ACT - Parse tool call from thought
            const action = this.parseAction(thought);
            if (!action) {
                // No action found, try to extract answer anyway
                const answer = this.extractAnswer(thought);
                if (answer) {
                    return {
                        answer,
                        steps,
                        iterations: iteration,
                        success: true
                    };
                }
                // Continue to next iteration
                conversationHistory.push({
                    role: 'assistant',
                    content: `Thought: ${thought}\n\nI need more information to answer this question.`
                });
                continue;
            }

            steps[steps.length - 1].action = action;

            // Step 3: OBSERVE - Execute tool and get result
            const observation = await this.executeAction(action, context);
            steps[steps.length - 1].observation = observation;

            // Add to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: `Thought: ${thought}\nAction: ${action.tool}(${JSON.stringify(action.arguments)})\nObservation: ${observation}`
            });
        }

        // Max iterations reached
        const finalAnswer = steps.length > 0
            ? this.extractAnswer(steps[steps.length - 1].thought) || 'Maximum iterations reached. Please try a simpler query.'
            : 'Unable to process query.';

        return {
            answer: finalAnswer,
            steps,
            iterations: this.maxIterations,
            success: false
        };
    }

    /**
     * Generate thought/reasoning for current iteration
     */
    private async generateThought(
        conversationHistory: ChatMessage[],
        iteration: number
    ): Promise<string> {
        const thoughtPrompt = `You are in iteration ${iteration} of a reasoning loop.

Previous conversation:
${conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}

Think about what you need to do next. If you have enough information, provide a final answer.
If you need more information, specify which tool to call and with what arguments.

Format your response as:
Thought: [your reasoning]
Action: [tool_name] OR Answer: [final answer]
Arguments: { "arg1": "value1", ... } (if action needed)`;

        const messages: ChatMessage[] = [
            ...conversationHistory,
            {
                role: 'user',
                content: thoughtPrompt
            }
        ];

        const response = await this.ollamaService.generateChatResponse(messages, [], {});
        return response.message;
    }

    /**
     * Parse action from thought text
     */
    private parseAction(thought: string): { tool: string; arguments: Record<string, any> } | null {
        // Look for "Action: tool_name" pattern
        const actionMatch = thought.match(/Action:\s*(\w+)/i);
        if (!actionMatch) {
            return null;
        }

        const toolName = actionMatch[1];

        // Look for arguments
        const argsMatch = thought.match(/Arguments:\s*(\{[\s\S]*\})/i);
        let actionArgs: Record<string, any> = {};
        if (argsMatch) {
            try {
                actionArgs = JSON.parse(argsMatch[1]);
            } catch {
                // Invalid JSON, use empty object
            }
        }

        return { tool: toolName, arguments: actionArgs };
    }

    /**
     * Execute action using tool registry
     */
    private async executeAction(
        action: { tool: string; arguments: Record<string, any> },
        context?: {
            userId?: string;
            organizationId?: string;
            projectId?: string;
        }
    ): Promise<string> {
        try {
            console.log(`[ReActOrchestrator] 🔨 Executing action: ${action.tool}`);
            const result = await this.toolRegistry.executeTool(
                action.tool,
                action.arguments,
                context
            );

            if (result.success) {
                return JSON.stringify(result.data || result.content?.[0]?.text || 'Action completed');
            } else {
                return `Error: ${result.error || 'Action failed'}`;
            }
        } catch (error: any) {
            return `Error executing ${action.tool}: ${error.message}`;
        }
    }

    /**
     * Check if thought contains final answer
     */
    private hasFinalAnswer(thought: string): boolean {
        return /Answer:/i.test(thought) ||
            /Final answer:/i.test(thought) ||
            /I can now provide/i.test(thought);
    }

    /**
     * Extract answer from thought
     */
    private extractAnswer(thought: string): string | null {
        const answerMatch = thought.match(/(?:Answer|Final answer):\s*(.+)/i);
        if (answerMatch) {
            return answerMatch[1].trim();
        }
        return null;
    }

    /**
     * Build system prompt with tool descriptions
     */
    private buildSystemPrompt(availableTools?: string[]): string {
        let prompt = `You are a helpful AI assistant that uses tools to answer questions.

You follow a ReAct (Reasoning + Acting) pattern:
1. THINK about what you need to do
2. ACT by calling a tool if needed
3. OBSERVE the result
4. Repeat until you have the answer

Always explain your reasoning before taking actions.`;

        if (availableTools && availableTools.length > 0) {
            prompt += `\n\nAvailable tools: ${availableTools.join(', ')}`;
        }

        return prompt;
    }
}
