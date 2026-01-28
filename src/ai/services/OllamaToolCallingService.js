"use strict";
/**
 * Ollama Tool Calling Service
 *
 * Extends OllamaAnalysisService with native chat and tool calling support.
 * Implements ReAct loop for tool execution with Ollama models.
 *
 * Features:
 * - Chat with tools (Ollama function calling)
 * - ReAct loop (Reasoning + Acting)
 * - Zod schema to Ollama JSON schema conversion
 * - Automatic tool result feeding back to model
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaToolCallingService = void 0;
const OllamaAnalysisService_1 = require("./OllamaAnalysisService");
const UnifiedToolRegistry_1 = require("./UnifiedToolRegistry");
const zod_1 = require("zod");
class OllamaToolCallingService extends OllamaAnalysisService_1.OllamaAnalysisService {
    toolRegistry;
    maxIterations = 10; // Max ReAct loop iterations
    constructor(baseUrl, toolRegistry) {
        super(baseUrl);
        this.toolRegistry = toolRegistry || (0, UnifiedToolRegistry_1.unifiedToolRegistry)();
    }
    /**
     * Generate chat response with tool calling support
     * Implements ReAct loop: Reason -> Act -> Observe -> Repeat
     */
    async generateChatResponse(messages, tools, // Tool names to include (if empty, uses all)
    context) {
        console.log('[OllamaToolCallingService] 💬 Starting chat with tool calling');
        console.log(`[OllamaToolCallingService] 📝 Messages: ${messages.length}`);
        console.log(`[OllamaToolCallingService] 🔧 Tools available: ${tools?.length || 'all'}`);
        // Check Ollama availability first
        try {
            const isAvailable = await this.checkAvailability();
            if (!isAvailable) {
                console.error('[OllamaToolCallingService] ❌ Ollama availability check returned false');
                throw new Error('Ollama service is not available');
            }
        }
        catch (error) {
            console.error('[OllamaToolCallingService] ❌ Ollama not available:', error?.message || error);
            // Re-throw with a specific error that can be caught by fallback logic
            const unavailableError = new Error('Ollama service is not available. Please ensure Ollama is running and accessible.');
            unavailableError.isOllamaUnavailable = true; // Flag for fallback detection
            throw unavailableError;
        }
        // Get available tools
        const availableTools = tools && tools.length > 0
            ? (await Promise.all(tools.map(name => this.toolRegistry.getTool(name)))).filter(Boolean)
            : await this.toolRegistry.getAllTools();
        if (availableTools.length === 0) {
            console.warn('[OllamaToolCallingService] ⚠️ No tools available, falling back to simple chat');
            return this.simpleChat(messages);
        }
        // Convert tools to Ollama format
        const toolSchemas = availableTools.map(tool => this.convertToolToOllamaFormat(tool));
        // Build system prompt with tool descriptions
        const systemPrompt = this.buildSystemPromptWithTools(availableTools);
        const conversationMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];
        // ReAct Loop
        let iteration = 0;
        let currentMessages = [...conversationMessages];
        let aggregatedToolResults = []; // Track all tool results across iterations
        while (iteration < this.maxIterations) {
            iteration++;
            console.log(`[OllamaToolCallingService] 🔄 ReAct iteration ${iteration}/${this.maxIterations}`);
            // Step 1: Generate response (with potential tool calls)
            let response;
            try {
                response = await this.callOllamaChat(currentMessages, toolSchemas);
            }
            catch (ollamaError) {
                // If Ollama fails during execution, throw error to trigger fallback
                console.error('[OllamaToolCallingService] ❌ Ollama chat failed:', ollamaError?.message || ollamaError);
                throw new Error('Ollama service is not available. Please ensure Ollama is running and accessible.');
            }
            // Step 2: Check if model wants to call tools
            if (response.tool_calls && response.tool_calls.length > 0) {
                console.log(`[OllamaToolCallingService] 🔨 Model requested ${response.tool_calls.length} tool calls`);
                // Add assistant message with tool calls
                currentMessages.push({
                    role: 'assistant',
                    content: response.message || '',
                    tool_calls: response.tool_calls.map((tc, idx) => ({
                        id: tc.id || `call_${idx}`,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments)
                        }
                    }))
                });
                // Step 3: Execute tools
                let toolResults;
                try {
                    toolResults = await this.executeToolCalls(response.tool_calls, context);
                }
                catch (toolError) {
                    console.error('[OllamaToolCallingService] ❌ Tool execution failed:', toolError?.message || toolError);
                    // Continue with error message as observation
                    toolResults = [{
                            tool_call_id: response.tool_calls?.[0]?.id,
                            tool_name: response.tool_calls?.[0]?.name || 'unknown',
                            content: JSON.stringify({ error: toolError?.message || 'Tool execution failed' }),
                            success: false
                        }];
                }
                // Collect results
                aggregatedToolResults.push(...toolResults);
                // Step 4: Add tool results back to conversation
                for (const result of toolResults) {
                    currentMessages.push({
                        role: 'tool',
                        content: result.content || JSON.stringify(result),
                        tool_call_id: result.tool_call_id,
                        name: result.tool_name
                    });
                }
                // Continue loop to get final answer
                continue;
            }
            else {
                // No tool calls - we have final answer
                console.log('[OllamaToolCallingService] ✅ Final answer received');
                // return response with aggregated tool results
                return {
                    ...response,
                    tool_results: aggregatedToolResults
                };
            }
        }
        // Max iterations reached
        console.warn('[OllamaToolCallingService] ⚠️ Max iterations reached, returning last response');
        return {
            message: 'Maximum iterations reached. Please try a simpler query.',
            finish_reason: 'length',
            tool_results: aggregatedToolResults
        };
    }
    /**
     * Call Ollama chat API with tools
     */
    async callOllamaChat(messages, toolSchemas) {
        const config = await this.resolveOllamaConfig();
        const activeUrl = config.baseUrl;
        const model = config.model;
        // Convert messages to Ollama format
        const ollamaMessages = messages.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    content: msg.content,
                    name: msg.name
                };
            }
            return {
                role: msg.role,
                content: msg.content
            };
        });
        const requestBody = {
            model,
            messages: ollamaMessages,
            stream: false,
            tools: toolSchemas.length > 0 ? toolSchemas : undefined,
            options: {
                temperature: 0.7,
                top_p: 0.9,
                num_predict: 2000
            }
        };
        try {
            const response = await fetch(`${activeUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    'User-Agent': 'Firebase-Functions-Ollama-Client/1.0'
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(60000) // 60s timeout
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const assistantMessage = data.message || {};
            // Parse tool calls from response
            const toolCalls = [];
            if (assistantMessage.tool_calls) {
                for (const tc of assistantMessage.tool_calls) {
                    try {
                        toolCalls.push({
                            name: tc.function?.name || '',
                            arguments: JSON.parse(tc.function?.arguments || '{}'),
                            id: tc.id
                        });
                    }
                    catch (e) {
                        console.warn('[OllamaToolCallingService] ⚠️ Failed to parse tool call:', e);
                    }
                }
            }
            return {
                message: assistantMessage.content || '',
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                finish_reason: data.done ? 'stop' : 'tool_calls'
            };
        }
        catch (error) {
            console.error('[OllamaToolCallingService] ❌ Ollama chat error:', error);
            throw error;
        }
    }
    /**
     * Execute tool calls and return results
     */
    async executeToolCalls(toolCalls, context) {
        const results = [];
        for (const toolCall of toolCalls) {
            try {
                console.log(`[OllamaToolCallingService] 🔨 Executing tool: ${toolCall.name}`);
                const result = await this.toolRegistry.executeTool(toolCall.name, toolCall.arguments, context);
                // Format result for Ollama
                const resultContent = result.content?.[0]?.text || JSON.stringify(result.data || result);
                results.push({
                    tool_call_id: toolCall.id,
                    tool_name: toolCall.name,
                    content: resultContent,
                    success: result.success
                });
            }
            catch (error) {
                console.error(`[OllamaToolCallingService] ❌ Error executing tool ${toolCall.name}:`, error);
                results.push({
                    tool_call_id: toolCall.id,
                    tool_name: toolCall.name,
                    content: JSON.stringify({ error: error.message }),
                    success: false
                });
            }
        }
        return results;
    }
    /**
     * Convert SharedTool to Ollama function format
     */
    convertToolToOllamaFormat(tool) {
        const zodSchema = tool.parameters;
        const jsonSchema = this.zodToJsonSchema(zodSchema);
        return {
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || '',
                parameters: jsonSchema
            }
        };
    }
    /**
     * Convert Zod schema to JSON Schema (Ollama format)
     */
    zodToJsonSchema(zodSchema) {
        // Basic implementation - can be extended for full Zod support
        if (zodSchema instanceof zod_1.z.ZodObject) {
            const shape = zodSchema.shape;
            const properties = {};
            const required = [];
            for (const [key, value] of Object.entries(shape)) {
                const fieldSchema = value;
                properties[key] = this.zodTypeToJsonSchema(fieldSchema);
                // Check if required (not optional)
                if (!(fieldSchema instanceof zod_1.z.ZodOptional)) {
                    required.push(key);
                }
            }
            return {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined
            };
        }
        // Fallback for non-object schemas
        return {
            type: 'object',
            properties: {},
            required: []
        };
    }
    /**
     * Convert individual Zod type to JSON Schema type
     */
    zodTypeToJsonSchema(zodType) {
        // Handle optional
        if (zodType instanceof zod_1.z.ZodOptional) {
            return this.zodTypeToJsonSchema(zodType._def.innerType);
        }
        // Handle nullable
        if (zodType instanceof zod_1.z.ZodNullable) {
            return this.zodTypeToJsonSchema(zodType._def.innerType);
        }
        // Handle string
        if (zodType instanceof zod_1.z.ZodString) {
            return { type: 'string', description: zodType.description };
        }
        // Handle number
        if (zodType instanceof zod_1.z.ZodNumber) {
            return { type: 'number', description: zodType.description };
        }
        // Handle boolean
        if (zodType instanceof zod_1.z.ZodBoolean) {
            return { type: 'boolean', description: zodType.description };
        }
        // Handle enum
        if (zodType instanceof zod_1.z.ZodEnum) {
            return {
                type: 'string',
                enum: zodType._def.values,
                description: zodType.description
            };
        }
        // Handle array
        if (zodType instanceof zod_1.z.ZodArray) {
            return {
                type: 'array',
                items: this.zodTypeToJsonSchema(zodType._def.type),
                description: zodType.description
            };
        }
        // Handle object (nested)
        if (zodType instanceof zod_1.z.ZodObject) {
            return this.zodToJsonSchema(zodType);
        }
        // Handle record
        if (zodType instanceof zod_1.z.ZodRecord) {
            return {
                type: 'object',
                additionalProperties: true,
                description: zodType.description
            };
        }
        // Default fallback
        return { type: 'string', description: zodType.description };
    }
    /**
     * Build system prompt with tool descriptions
     */
    buildSystemPromptWithTools(tools) {
        const toolDescriptions = tools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n');
        return `You are a helpful AI assistant with access to ${tools.length} tools.

Available tools:
${toolDescriptions}

When you need to use a tool, call it with the appropriate parameters. After receiving tool results, analyze them and provide a helpful response to the user.

Always explain what you're doing and why.`;
    }
    /**
     * Simple chat without tools (fallback)
     */
    async simpleChat(messages) {
        // Check availability before attempting chat
        const isAvailable = await this.checkAvailability();
        if (!isAvailable) {
            throw new Error('Ollama service is not available. Please ensure Ollama is running and accessible.');
        }
        const config = await this.resolveOllamaConfig();
        const activeUrl = config.baseUrl;
        const model = config.model;
        const response = await fetch(`${activeUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                stream: false
            }),
            signal: AbortSignal.timeout(60000)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        return {
            message: data.message?.content || '',
            finish_reason: 'stop'
        };
    }
    /**
     * Resolve configuration (URL and Model), checking Firestore for overrides
     */
    async resolveOllamaConfig() {
        // Defaults from environment or fallback
        let baseUrl = this.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        let fastModel = process.env.OLLAMA_MODEL_FAST || 'phi4-mini';
        // In some runtimes (Electron/local/offline), Firestore-based config overrides are undesirable.
        if (process.env.OLLAMA_DISABLE_FIRESTORE_CONFIG === 'true') {
            return { baseUrl, model: fastModel };
        }
        // Check Firestore for dynamic configuration
        try {
            // Lazy import so this service can run in environments without firebase-admin
            const adminModule = await Promise.resolve().then(() => __importStar(require('firebase-admin')));
            const adminAny = adminModule?.default || adminModule;
            const configDoc = await adminAny.firestore()
                .collection('_system').doc('config')
                .collection('ai').doc('ollama').get();
            if (configDoc.exists) {
                const data = configDoc.data();
                if (data?.baseUrl) {
                    baseUrl = data.baseUrl;
                }
                if (data?.fastModel) {
                    fastModel = data.fastModel;
                    console.log(`[OllamaToolCallingService] 🚀 Using dynamic model from Firestore: ${fastModel}`);
                }
            }
        }
        catch (error) {
            console.warn('[OllamaToolCallingService] ⚠️ Failed to fetch dynamic config:', error);
        }
        return { baseUrl, model: fastModel };
    }
    /**
     * Resolve base URL (Legacy/helper Wrapper)
     */
    async resolveOllamaBaseUrl() {
        const config = await this.resolveOllamaConfig();
        return config.baseUrl;
    }
}
exports.OllamaToolCallingService = OllamaToolCallingService;
