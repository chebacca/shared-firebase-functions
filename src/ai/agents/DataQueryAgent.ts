/**
 * Data Query Agent
 * 
 * Specialized agent for read-only data queries.
 * Low risk - only uses query/search/get/list tools.
 * Optimized for fast information retrieval.
 */

import { OllamaToolCallingService } from '../services/OllamaToolCallingService';
import { UnifiedToolRegistry } from '../services/UnifiedToolRegistry';
import { ChatMessage } from '../services/OllamaToolCallingService';

export interface QueryContext {
    userId?: string;
    organizationId?: string;
    projectId?: string;
}

export class DataQueryAgent {
    private ollamaService: OllamaToolCallingService;
    private toolRegistry: UnifiedToolRegistry;
    private queryTools: string[] = [];

    constructor(
        ollamaService: OllamaToolCallingService,
        toolRegistry: UnifiedToolRegistry
    ) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        this.initializeQueryTools();
    }

    /**
     * Initialize list of read-only query tools
     */
    private initializeQueryTools(): void {
        const allTools = this.toolRegistry.getAllTools();
        this.queryTools = allTools
            .filter(tool => {
                const name = tool.name.toLowerCase();
                return name.includes('query') ||
                    name.includes('search') ||
                    name.includes('get') ||
                    name.includes('list') ||
                    name.includes('fetch') ||
                    name.includes('retrieve');
            })
            .map(tool => tool.name);

        console.log(`[DataQueryAgent] 🔍 Initialized with ${this.queryTools.length} query tools`);
    }

    /**
     * Execute a data query
     */
    async executeQuery(
        userQuery: string,
        context: QueryContext
    ): Promise<{
        answer: string;
        toolsUsed: string[];
        data: any;
    }> {
        console.log(`[DataQueryAgent] 🔍 Executing query: ${userQuery.substring(0, 100)}...`);

        const messages: ChatMessage[] = [
            {
                role: 'user',
                content: userQuery
            }
        ];

        const response = await this.ollamaService.generateChatResponse(
            messages,
            this.queryTools,
            context
        );

        return {
            answer: response.message,
            toolsUsed: [], // Track in future iterations
            data: response
        };
    }

    /**
     * Check if a query is appropriate for this agent
     */
    static isQueryIntent(query: string): boolean {
        const queryKeywords = [
            'find', 'search', 'get', 'list', 'show', 'display',
            'query', 'fetch', 'retrieve', 'what', 'where', 'when',
            'who', 'how many', 'count', 'check', 'lookup'
        ];

        const lowerQuery = query.toLowerCase();
        return queryKeywords.some(keyword => lowerQuery.includes(keyword));
    }
}
