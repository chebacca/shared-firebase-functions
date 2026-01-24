/**
 * Unified Tool Registry
 * 
 * Loads tools directly from shared-backbone-intelligence library.
 * This provides a single source of truth for all 240+ tools accessible by:
 * - Firebase Functions (direct import, 0ms latency)
 * - MCP Server (import from library)
 * - Local Scripts (direct import)
 * 
 * No stdio spawning required - all tools are native TypeScript functions.
 */

import type { SharedTool } from 'shared-backbone-intelligence';
import { z } from 'zod';

export interface ToolExecutionResult {
    success: boolean;
    data?: any;
    error?: string;
    content?: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

export class UnifiedToolRegistry {
    private tools: Map<string, SharedTool> = new Map();
    private initialized: boolean = false;

    constructor() {
        // Lazy initialization to avoid circular dependencies at module load
    }

    /**
     * Initialize the registry by loading all tools from shared-backbone-intelligence
     */
    private initialize(): void {
        if (this.initialized) return;

        try {
            // Lazy import to avoid circular dependencies
            const { allTools } = require('shared-backbone-intelligence');
            
            console.log(`[UnifiedToolRegistry] 🔧 Initializing with ${allTools.length} tools from shared-backbone-intelligence`);

            for (const tool of allTools) {
                this.tools.set(tool.name, tool);
            }

            this.initialized = true;
            console.log(`[UnifiedToolRegistry] ✅ Registered ${this.tools.size} tools`);
        } catch (error) {
            console.error(`[UnifiedToolRegistry] ❌ Error initializing:`, error);
            // Continue with empty registry
            this.initialized = true;
        }
    }

    /**
     * Ensure registry is initialized (lazy initialization)
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            this.initialize();
        }
    }

    /**
     * Get all available tools
     */
    public getAllTools(): SharedTool[] {
        this.ensureInitialized();
        return Array.from(this.tools.values());
    }

    /**
     * Get a tool by name
     */
    public getTool(name: string): SharedTool | undefined {
        this.ensureInitialized();
        return this.tools.get(name);
    }

    /**
     * Check if a tool exists
     */
    public hasTool(name: string): boolean {
        this.ensureInitialized();
        return this.tools.has(name);
    }

    /**
     * Execute a tool by name with arguments
     */
    public async executeTool(
        toolName: string,
        args: Record<string, any>,
        context?: {
            userId?: string;
            organizationId?: string;
            projectId?: string;
        }
    ): Promise<ToolExecutionResult> {
        this.ensureInitialized();
        const tool = this.getTool(toolName);

        if (!tool) {
            return {
                success: false,
                error: `Tool "${toolName}" not found in registry`,
                isError: true,
                content: [{
                    type: 'text',
                    text: JSON.stringify({ error: `Tool "${toolName}" not found` })
                }]
            };
        }

        try {
            // Validate arguments against tool schema
            const validatedArgs = this.validateArgs(tool, args, context);

            // Execute the tool
            console.log(`[UnifiedToolRegistry] 🔨 Executing tool: ${toolName}`);
            const result = await tool.execute(validatedArgs);

            // Normalize result format
            if (result.isError) {
                return {
                    success: false,
                    isError: true,
                    error: result.content?.[0]?.text || 'Tool execution failed',
                    content: result.content
                };
            }

            return {
                success: true,
                data: result,
                content: result.content
            };
        } catch (error: any) {
            console.error(`[UnifiedToolRegistry] ❌ Error executing tool ${toolName}:`, error);
            return {
                success: false,
                isError: true,
                error: error.message || 'Tool execution error',
                content: [{
                    type: 'text',
                    text: JSON.stringify({ error: error.message || 'Tool execution failed' })
                }]
            };
        }
    }

    /**
     * Validate and enrich arguments with context
     */
    private validateArgs(
        tool: SharedTool,
        args: Record<string, any>,
        context?: {
            userId?: string;
            organizationId?: string;
            projectId?: string;
        }
    ): Record<string, any> {
        // Parse the Zod schema
        const schema = tool.parameters as z.ZodObject<any>;

        // Add context if tool schema supports it
        const enrichedArgs = { ...args };
        if (context?.userId && schema.shape.userId) {
            enrichedArgs.userId = context.userId;
        }
        if (context?.organizationId && schema.shape.organizationId) {
            enrichedArgs.organizationId = context.organizationId;
        }
        if (context?.projectId && schema.shape.projectId) {
            enrichedArgs.projectId = context.projectId;
        }

        // Validate against schema
        try {
            return schema.parse(enrichedArgs);
        } catch (error: any) {
            console.error(`[UnifiedToolRegistry] ⚠️ Schema validation failed for ${tool.name}:`, error);
            // Return enriched args anyway - let the tool handle validation
            return enrichedArgs;
        }
    }

    /**
     * Get tool schema in Ollama-compatible JSON format
     */
    public getToolSchemaForOllama(toolName: string): any | null {
        const tool = this.getTool(toolName);
        if (!tool) return null;

        return this.convertZodToOllamaSchema(tool.parameters, tool.name, tool.description);
    }

    /**
     * Convert Zod schema to Ollama JSON schema format
     */
    private convertZodToOllamaSchema(
        zodSchema: z.ZodType<any>,
        name: string,
        description: string
    ): any {
        // For now, return a simplified schema
        // Full implementation would recursively convert Zod types to JSON Schema
        return {
            type: 'function',
            function: {
                name,
                description,
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        };
    }

    /**
     * Get all tool schemas in Ollama format
     */
    public getAllToolSchemasForOllama(): any[] {
        return this.getAllTools()
            .map(tool => this.getToolSchemaForOllama(tool.name))
            .filter((schema): schema is any => schema !== null);
    }

    /**
     * Get tools by category (based on tool name patterns)
     */
    public getToolsByCategory(): Record<string, SharedTool[]> {
        this.ensureInitialized();
        const categories: Record<string, SharedTool[]> = {
            query: [],
            action: [],
            report: [],
            workflow: []
        };

        for (const tool of this.getAllTools()) {
            const name = tool.name.toLowerCase();
            if (name.includes('query') || name.includes('search') || name.includes('get') || name.includes('list')) {
                categories.query.push(tool);
            } else if (name.includes('create') || name.includes('update') || name.includes('delete') || name.includes('approve')) {
                categories.action.push(tool);
            } else if (name.includes('report') || name.includes('analytics') || name.includes('generate')) {
                categories.report.push(tool);
            } else if (name.includes('workflow')) {
                categories.workflow.push(tool);
            } else {
                // Default to action for unknown tools
                categories.action.push(tool);
            }
        }

        return categories;
    }
}

// Global singleton instance (lazy initialization)
let _unifiedToolRegistry: UnifiedToolRegistry | null = null;

export const unifiedToolRegistry = (): UnifiedToolRegistry => {
    if (!_unifiedToolRegistry) {
        _unifiedToolRegistry = new UnifiedToolRegistry();
    }
    return _unifiedToolRegistry;
};
