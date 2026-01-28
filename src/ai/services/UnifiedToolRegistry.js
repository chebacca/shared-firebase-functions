"use strict";
/**
 * Unified Tool Registry
 *
 * Merges tools from multiple sources:
 * 1. MCP Server (240+ tools) - Primary source, highest priority
 * 2. shared-backbone-intelligence (20 tools) - Fallback for tools not in MCP
 * 3. Local tools (DataToolExecutor) - Legacy tools
 *
 * Provides unified access to all Backbone ecosystem tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unifiedToolRegistry = exports.UnifiedToolRegistry = void 0;
const zod_1 = require("zod");
const MCPClientAdapter_1 = require("../MCPClientAdapter");
class UnifiedToolRegistry {
    tools = new Map();
    mcpClient = null;
    initialized = false;
    initializationPromise = null;
    constructor() {
        // Lazy initialization to avoid circular dependencies at module load
    }
    /**
     * Initialize the registry by loading tools from all sources
     */
    async initialize() {
        if (this.initialized)
            return;
        if (this.initializationPromise) {
            return this.initializationPromise;
        }
        this.initializationPromise = this.doInitialize();
        await this.initializationPromise;
    }
    async doInitialize() {
        try {
            console.log(`[UnifiedToolRegistry] 🔧 Initializing unified tool registry...`);
            // 1. Connect to MCP server and load MCP tools (highest priority)
            // MODIFIED: Check env var to prevent MCP hanging
            if (process.env.ENABLE_MCP !== 'false') {
                try {
                    this.mcpClient = (0, MCPClientAdapter_1.mcpClientAdapter)();
                    await this.mcpClient.connect();
                    const mcpTools = await this.mcpClient.discoverTools();
                    console.log(`[UnifiedToolRegistry] 📡 Loaded ${mcpTools.length} tools from MCP server`);
                    // Convert MCP tools to UnifiedTool format
                    for (const mcpTool of mcpTools) {
                        this.tools.set(mcpTool.name, {
                            name: mcpTool.name,
                            description: mcpTool.description,
                            parameters: zod_1.z.any(), // MCP tools use JSON Schema, convert as needed
                            execute: async (args) => {
                                const result = await this.mcpClient.callTool(mcpTool.name, args);
                                return result;
                            },
                            source: 'mcp'
                        });
                    }
                }
                catch (mcpError) {
                    console.warn(`[UnifiedToolRegistry] ⚠️ Failed to load MCP tools: ${mcpError.message}`);
                    console.warn(`[UnifiedToolRegistry] ⚠️ Continuing with shared tools only`);
                }
            }
            else {
                console.log('[UnifiedToolRegistry] ⏭️ Skipping MCP initialization (ENABLE_MCP=false)');
            }
            // 2. Load shared-backbone-intelligence tools (fallback, lower priority)
            try {
                const { allTools } = require('shared-backbone-intelligence');
                console.log(`[UnifiedToolRegistry] 📚 Loading ${allTools.length} tools from shared-backbone-intelligence`);
                for (const tool of allTools) {
                    // Only add if not already in registry (MCP takes priority)
                    if (!this.tools.has(tool.name)) {
                        this.tools.set(tool.name, {
                            name: tool.name,
                            description: tool.description || '',
                            parameters: tool.parameters,
                            execute: tool.execute,
                            source: 'shared'
                        });
                    }
                }
            }
            catch (error) {
                console.error(`[UnifiedToolRegistry] ❌ Error loading shared tools:`, error);
            }
            this.initialized = true;
            console.log(`[UnifiedToolRegistry] ✅ Registered ${this.tools.size} tools total`);
            console.log(`[UnifiedToolRegistry] 📊 Breakdown: ${Array.from(this.tools.values()).filter(t => t.source === 'mcp').length} MCP, ${Array.from(this.tools.values()).filter(t => t.source === 'shared').length} shared`);
        }
        catch (error) {
            console.error(`[UnifiedToolRegistry] ❌ Error initializing:`, error);
            // Continue with empty registry
            this.initialized = true;
        }
    }
    /**
     * Ensure registry is initialized (lazy initialization)
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    /**
     * Get all available tools
     */
    async getAllTools() {
        await this.ensureInitialized();
        return Array.from(this.tools.values());
    }
    /**
     * Get a tool by name
     */
    async getTool(name) {
        await this.ensureInitialized();
        return this.tools.get(name);
    }
    /**
     * Check if a tool exists
     */
    async hasTool(name) {
        await this.ensureInitialized();
        return this.tools.has(name);
    }
    /**
     * Execute a tool by name with arguments
     */
    async executeTool(toolName, args, context) {
        await this.ensureInitialized();
        const tool = await this.getTool(toolName);
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
            // Enrich args with context
            const enrichedArgs = this.enrichArgsWithContext(args, context);
            // For MCP tools, skip Zod validation (they use JSON Schema)
            // For shared tools, validate with Zod
            let validatedArgs = enrichedArgs;
            if (tool.source === 'shared' && tool.parameters instanceof zod_1.z.ZodObject) {
                validatedArgs = this.validateArgs(tool, enrichedArgs, context);
            }
            // Execute the tool
            console.log(`[UnifiedToolRegistry] 🔨 Executing tool: ${toolName} (source: ${tool.source})`);
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
            // Parse MCP result format
            if (tool.source === 'mcp' && result.content) {
                try {
                    const contentText = result.content[0]?.text || '';
                    const parsed = JSON.parse(contentText);
                    return {
                        success: parsed.success !== false,
                        data: parsed,
                        content: result.content
                    };
                }
                catch {
                    // Not JSON, return as-is
                    return {
                        success: true,
                        data: result,
                        content: result.content
                    };
                }
            }
            return {
                success: true,
                data: result,
                content: result.content
            };
        }
        catch (error) {
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
     * Enrich arguments with context (for all tool types)
     */
    enrichArgsWithContext(args, context) {
        const enriched = { ...args };
        // Always add context if provided (tools can use it)
        if (context?.userId && !enriched.userId) {
            enriched.userId = context.userId;
        }
        if (context?.organizationId && !enriched.organizationId) {
            enriched.organizationId = context.organizationId;
        }
        if (context?.projectId && !enriched.projectId) {
            enriched.projectId = context.projectId;
        }
        return enriched;
    }
    /**
     * Validate and enrich arguments with context (for shared tools with Zod schemas)
     */
    validateArgs(tool, args, context) {
        // Only validate if tool has Zod schema
        if (!(tool.parameters instanceof zod_1.z.ZodObject)) {
            return args;
        }
        const schema = tool.parameters;
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
        }
        catch (error) {
            console.error(`[UnifiedToolRegistry] ⚠️ Schema validation failed for ${tool.name}:`, error);
            // Return enriched args anyway - let the tool handle validation
            return enrichedArgs;
        }
    }
    /**
     * Get tool schema in Ollama-compatible JSON format
     */
    async getToolSchemaForOllama(toolName) {
        const tool = await this.getTool(toolName);
        if (!tool)
            return null;
        // For MCP tools, we need to get schema from MCP client
        if (tool.source === 'mcp' && this.mcpClient) {
            const mcpTool = this.mcpClient.getTools().find(t => t.name === toolName);
            if (mcpTool) {
                return this.convertJsonSchemaToOllama(mcpTool.inputSchema, tool.name, tool.description);
            }
        }
        // For shared tools, convert Zod to Ollama
        return this.convertZodToOllamaSchema(tool.parameters, tool.name, tool.description);
    }
    /**
     * Convert Zod schema to Ollama JSON schema format
     */
    convertZodToOllamaSchema(zodSchema, name, description) {
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
    async getAllToolSchemasForOllama() {
        const tools = await this.getAllTools();
        const schemas = await Promise.all(tools.map(tool => this.getToolSchemaForOllama(tool.name)));
        return schemas.filter((schema) => schema !== null);
    }
    /**
     * Convert JSON Schema (from MCP) to Ollama format
     */
    convertJsonSchemaToOllama(jsonSchema, name, description) {
        return {
            type: 'function',
            function: {
                name,
                description,
                parameters: jsonSchema || {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        };
    }
    /**
     * Get tools by category (based on tool name patterns)
     */
    async getToolsByCategory() {
        await this.ensureInitialized();
        const categories = {
            query: [],
            action: [],
            report: [],
            workflow: []
        };
        const tools = await this.getAllTools();
        for (const tool of tools) {
            const name = tool.name.toLowerCase();
            if (name.includes('query') || name.includes('search') || name.includes('get') || name.includes('list')) {
                categories.query.push(tool);
            }
            else if (name.includes('create') || name.includes('update') || name.includes('delete') || name.includes('approve')) {
                categories.action.push(tool);
            }
            else if (name.includes('report') || name.includes('analytics') || name.includes('generate')) {
                categories.report.push(tool);
            }
            else if (name.includes('workflow')) {
                categories.workflow.push(tool);
            }
            else {
                // Default to action for unknown tools
                categories.action.push(tool);
            }
        }
        return categories;
    }
    /**
     * Get tools by source
     */
    async getToolsBySource() {
        await this.ensureInitialized();
        const tools = await this.getAllTools();
        return {
            mcp: tools.filter(t => t.source === 'mcp'),
            shared: tools.filter(t => t.source === 'shared')
        };
    }
}
exports.UnifiedToolRegistry = UnifiedToolRegistry;
// Global singleton instance (lazy initialization)
let _unifiedToolRegistry = null;
const unifiedToolRegistry = () => {
    if (!_unifiedToolRegistry) {
        _unifiedToolRegistry = new UnifiedToolRegistry();
    }
    return _unifiedToolRegistry;
};
exports.unifiedToolRegistry = unifiedToolRegistry;
