/**
 * MCP Client Adapter
 * 
 * Connects Firebase Functions to the MCP server via stdio.
 * Enables access to all 240+ tools from the MCP server.
 * 
 * Architecture: Spawns MCP server process and communicates via stdin/stdout using JSON-RPC
 * 
 * Note: This is a simplified implementation. For production, consider using
 * the official MCP SDK client, but that requires additional dependencies.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any; // JSON Schema
}

export interface MCPToolCallResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
}

export class MCPClientAdapter {
    private process: ChildProcess | null = null;
    private isConnected: boolean = false;
    private mcpServerPath: string;
    private tools: Map<string, MCPTool> = new Map();
    private requestId: number = 0;
    private pendingRequests: Map<number, PendingRequest> = new Map();
    private stdoutBuffer: string = '';

    constructor(mcpServerPath?: string) {
        // Default to the MCP server in the workspace
        // Try multiple possible paths
        const possiblePaths = [
            mcpServerPath,
            path.resolve(__dirname, '../../../../_backbone_mcp_server/dist/index.js'),
            path.resolve(process.cwd(), '_backbone_mcp_server/dist/index.js'),
            path.resolve(process.cwd(), '../../_backbone_mcp_server/dist/index.js')
        ].filter(Boolean) as string[];

        let mcpPath: string | undefined;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                mcpPath = testPath;
                console.log(`[MCPClientAdapter] ✅ Found MCP server at: ${testPath}`);
                break;
            }
        }

        this.mcpServerPath = mcpPath || possiblePaths[0] || path.resolve(process.cwd(), '_backbone_mcp_server/dist/index.js');

        if (!mcpPath) {
            console.warn(`[MCPClientAdapter] ⚠️ MCP server not found. Will attempt connection on first use.`);
        }
    }

    /**
     * Connect to MCP server via stdio
     */
    async connect(): Promise<void> {
        if (this.isConnected && this.process && !this.process.killed) {
            console.log('[MCPClientAdapter] ✅ Already connected');
            return;
        }

        // Verify path exists
        if (!fs.existsSync(this.mcpServerPath)) {
            console.warn(`[MCPClientAdapter] ⚠️ MCP server not found at: ${this.mcpServerPath}`);
            console.warn(`[MCPClientAdapter] ⚠️ Will continue without MCP tools (using shared tools only)`);
            this.isConnected = false;
            return;
        }

        console.log(`[MCPClientAdapter] 🔌 Connecting to MCP server: ${this.mcpServerPath}`);

        // Spawn MCP server process
        this.process = spawn('node', [this.mcpServerPath], {
            env: {
                ...process.env,
                FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'backbone-logic',
                MCP_TOOL_MODE: 'all', // Enable all 240+ tools
                NODE_ENV: process.env.NODE_ENV || 'production'
            },
            stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
        });

        // Handle stdout (MCP server responses - JSON-RPC messages)
        this.process.stdout?.on('data', (data: Buffer) => {
            this.stdoutBuffer += data.toString();
            this.parseMCPMessages();
        });

        // Handle stderr (logs - filter to avoid noise)
        this.process.stderr?.on('data', (data: Buffer) => {
            const log = data.toString();
            // Only log errors and important messages
            if (log.includes('ERROR') || log.includes('❌') || log.includes('✅') || log.includes('📊')) {
                console.log(`[MCP Server] ${log.trim()}`);
            }
        });

        // Handle process exit
        this.process.on('exit', (code) => {
            console.warn(`[MCPClientAdapter] ⚠️ MCP server process exited with code ${code}`);
            this.isConnected = false;
            this.process = null;
            // Clear pending requests
            for (const [id, req] of this.pendingRequests.entries()) {
                clearTimeout(req.timeout);
                req.reject(new Error('MCP server process exited'));
            }
            this.pendingRequests.clear();
        });

        // Wait for initialization
        try {
            await this.initialize();
            this.isConnected = true;
            console.log('[MCPClientAdapter] ✅ Connected to MCP server');
        } catch (error: any) {
            console.error('[MCPClientAdapter] ❌ Failed to initialize:', error.message);
            this.isConnected = false;
            // Don't throw - allow fallback to shared tools
        }
    }

    /**
     * Initialize MCP connection (send initialize request)
     */
    private async initialize(): Promise<void> {
        // Send initialize request via JSON-RPC
        const initRequest = {
            jsonrpc: '2.0',
            id: this.getNextRequestId(),
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                clientInfo: {
                    name: 'backbone-firebase-functions',
                    version: '1.0.0'
                }
            }
        };

        await this.sendRequest(initRequest);

        // Discover available tools
        await this.discoverTools();
    }

    /**
     * Discover all available tools from MCP server
     */
    async discoverTools(): Promise<MCPTool[]> {
        if (!this.isConnected) {
            await this.connect();
        }

        if (!this.isConnected) {
            console.warn('[MCPClientAdapter] ⚠️ Not connected, returning empty tool list');
            return [];
        }

        const listToolsRequest = {
            jsonrpc: '2.0',
            id: this.getNextRequestId(),
            method: 'tools/list',
            params: {}
        };

        try {
            const response = await this.sendRequest(listToolsRequest);
            const tools = response.result?.tools || [];

            // Cache tools
            tools.forEach((tool: any) => {
                this.tools.set(tool.name, {
                    name: tool.name,
                    description: tool.description || '',
                    inputSchema: tool.inputSchema || {}
                });
            });

            console.log(`[MCPClientAdapter] 🔍 Discovered ${tools.length} tools from MCP server`);
            return Array.from(this.tools.values());
        } catch (error: any) {
            console.error('[MCPClientAdapter] ❌ Failed to discover tools:', error);
            return [];
        }
    }

    /**
     * Call a tool on the MCP server
     */
    async callTool(
        toolName: string,
        toolArgs: Record<string, any>
    ): Promise<MCPToolCallResult> {
        if (!this.isConnected) {
            await this.connect();
        }

        if (!this.isConnected) {
            throw new Error('MCP server not connected');
        }

        const toolCallRequest = {
            jsonrpc: '2.0',
            id: this.getNextRequestId(),
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: toolArgs
            }
        };

        try {
            const response = await this.sendRequest(toolCallRequest);
            const result = response.result;

            // Parse MCP tool result format
            if (result.isError) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: result.content?.[0]?.text || 'Tool execution failed'
                        })
                    }],
                    isError: true
                };
            }

            return {
                content: result.content || [{
                    type: 'text',
                    text: JSON.stringify(result)
                }],
                isError: false
            };
        } catch (error: any) {
            console.error(`[MCPClientAdapter] ❌ Error calling tool ${toolName}:`, error);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: error.message || 'Tool execution failed'
                    })
                }],
                isError: true
            };
        }
    }

    /**
     * Send JSON-RPC request to MCP server
     */
    private async sendRequest(request: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin) {
                reject(new Error('MCP server process not available'));
                return;
            }

            const requestId = request.id;
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Request ${requestId} timed out after 30s`));
                }
            }, 30000);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            // Send request via stdin (JSON-RPC format: one JSON object per line)
            const requestJson = JSON.stringify(request) + '\n';
            this.process.stdin!.write(requestJson, (error) => {
                if (error) {
                    this.pendingRequests.delete(requestId);
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        });
    }

    /**
     * Parse MCP messages from stdout buffer (JSON-RPC format)
     */
    private parseMCPMessages(): void {
        // MCP uses JSON-RPC, one message per line
        const lines = this.stdoutBuffer.split('\n');

        // Keep incomplete line in buffer
        this.stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const message = JSON.parse(line);
                this.handleMCPMessage(message);
            } catch (error) {
                // Not valid JSON, might be log output - ignore
            }
        }
    }

    /**
     * Handle incoming MCP message (JSON-RPC response)
     */
    private handleMCPMessage(message: any): void {
        // Handle JSON-RPC response
        if (message.id && this.pendingRequests.has(message.id)) {
            const request = this.pendingRequests.get(message.id)!;
            this.pendingRequests.delete(message.id);
            clearTimeout(request.timeout);

            if (message.error) {
                request.reject(new Error(message.error.message || 'MCP server error'));
            } else {
                request.resolve(message);
            }
        }
    }

    /**
     * Get next request ID
     */
    private getNextRequestId(): number {
        return ++this.requestId;
    }

    /**
     * Get all cached tools
     */
    getTools(): MCPTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Check if tool exists
     */
    hasTool(toolName: string): boolean {
        return this.tools.has(toolName);
    }

    /**
     * Disconnect from MCP server
     */
    async disconnect(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.isConnected = false;
        this.tools.clear();
        // Clear pending requests
        for (const [id, req] of this.pendingRequests.entries()) {
            clearTimeout(req.timeout);
            req.reject(new Error('MCP client disconnected'));
        }
        this.pendingRequests.clear();
        this.stdoutBuffer = '';
        console.log('[MCPClientAdapter] 🔌 Disconnected from MCP server');
    }

    /**
     * Check connection status
     */
    getConnectionStatus(): boolean {
        return this.isConnected && this.process !== null && !this.process.killed;
    }
}

// Global singleton instance (lazy initialization)
let _mcpClientAdapter: MCPClientAdapter | null = null;

export const mcpClientAdapter = (): MCPClientAdapter => {
    if (!_mcpClientAdapter) {
        _mcpClientAdapter = new MCPClientAdapter();
    }
    return _mcpClientAdapter;
};
