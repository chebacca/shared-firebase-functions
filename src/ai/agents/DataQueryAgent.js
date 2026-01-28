"use strict";
/**
 * Data Query Agent
 *
 * Specialized agent for read-only data queries.
 * Low risk - only uses query/search/get/list tools.
 * Optimized for fast information retrieval.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQueryAgent = void 0;
class DataQueryAgent {
    ollamaService;
    toolRegistry;
    queryTools = [];
    constructor(ollamaService, toolRegistry) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        // Initialize tools asynchronously (will be ready by first use)
        this.initializeQueryTools().catch(err => {
            console.error('[DataQueryAgent] ⚠️ Failed to initialize query tools:', err);
        });
    }
    /**
     * Initialize list of read-only query tools
     */
    async initializeQueryTools() {
        const allTools = await this.toolRegistry.getAllTools();
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
    async executeQuery(userQuery, context) {
        console.log(`[DataQueryAgent] 🔍 Executing query: ${userQuery.substring(0, 100)}...`);
        // Ensure tools are initialized
        if (this.queryTools.length === 0) {
            await this.initializeQueryTools();
        }
        const messages = [
            {
                role: 'user',
                content: userQuery
            }
        ];
        try {
            const response = await this.ollamaService.generateChatResponse(messages, this.queryTools, context);
            return {
                answer: response.message,
                toolsUsed: response.tool_results?.map(t => t.tool_name) || [],
                data: {
                    ...response,
                    tool_results: response.tool_results // Explicitly pass results
                }
            };
        }
        catch (error) {
            // Re-throw Ollama errors so they can be caught by masterAgentV2 fallback logic
            console.error('[DataQueryAgent] ❌ Ollama error in executeQuery:', error?.message || error);
            throw error; // Let error propagate to trigger Gemini fallback
        }
    }
    /**
     * Check if a query is appropriate for this agent
     */
    static isQueryIntent(query) {
        const queryKeywords = [
            'find', 'search', 'get', 'list', 'show', 'display',
            'query', 'fetch', 'retrieve', 'what', 'where', 'when',
            'who', 'how many', 'count', 'check', 'lookup'
        ];
        const lowerQuery = query.toLowerCase();
        return queryKeywords.some(keyword => lowerQuery.includes(keyword));
    }
}
exports.DataQueryAgent = DataQueryAgent;
