"use strict";
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
exports.mcpClientAdapter = exports.MCPClientAdapter = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class MCPClientAdapter {
    process = null;
    isConnected = false;
    mcpServerPath;
    tools = new Map();
    requestId = 0;
    pendingRequests = new Map();
    stdoutBuffer = '';
    constructor(mcpServerPath) {
        // Default to the MCP server in the workspace
        // Try multiple possible paths
        const possiblePaths = [
            mcpServerPath,
            // Prefer cwd-based paths (Cloud Functions runtime runs from functions folder)
            path.resolve(process.cwd(), '_backbone_mcp_server/dist/index.js'),
            path.resolve(process.cwd(), 'lib/_backbone_mcp_server/dist/index.js'),
            // Bundled inside functions `lib/` (preferred in deployed runtime when resolved by __dirname)
            path.resolve(__dirname, '../_backbone_mcp_server/dist/index.js'),
            // Repo-root fallback (local dev)
            path.resolve(__dirname, '../../../../_backbone_mcp_server/dist/index.js'),
            path.resolve(process.cwd(), '../../_backbone_mcp_server/dist/index.js')
        ].filter(Boolean);
        let mcpPath;
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
    async connect() {
        if (this.isConnected && this.process && !this.process.killed) {
            console.log('[MCPClientAdapter] ✅ Already connected');
            return;
        }
        // If we have a stale process, kill it before reconnecting
        if (this.process && !this.process.killed) {
            try {
                this.process.kill();
            }
            catch {
                // ignore
            }
            this.process = null;
            this.isConnected = false;
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
        this.process = (0, child_process_1.spawn)('node', [this.mcpServerPath], {
            env: {
                ...process.env,
                FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'backbone-logic',
                MCP_TOOL_MODE: 'all', // Enable all 240+ tools
                NODE_ENV: process.env.NODE_ENV || 'production'
            },
            stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
        });
        // Handle stdout (MCP server responses - JSON-RPC messages)
        this.process.stdout?.on('data', (data) => {
            this.stdoutBuffer += data.toString();
            this.parseMCPMessages();
        });
        // Handle stderr (logs - filter to avoid noise)
        this.process.stderr?.on('data', (data) => {
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
        }
        catch (error) {
            console.error('[MCPClientAdapter] ❌ Failed to initialize:', error.message);
            this.isConnected = false;
            // Kill process on failed init so we don't leak children / loop reconnect
            try {
                this.process?.kill();
            }
            catch {
                // ignore
            }
            this.process = null;
            // Don't throw - allow fallback to shared tools
        }
    }
    /**
     * Initialize MCP connection (send initialize request)
     */
    async initialize() {
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
    async discoverTools() {
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
            tools.forEach((tool) => {
                this.tools.set(tool.name, {
                    name: tool.name,
                    description: tool.description || '',
                    inputSchema: tool.inputSchema || {}
                });
            });
            console.log(`[MCPClientAdapter] 🔍 Discovered ${tools.length} tools from MCP server`);
            return Array.from(this.tools.values());
        }
        catch (error) {
            console.error('[MCPClientAdapter] ❌ Failed to discover tools:', error);
            return [];
        }
    }
    /**
     * Call a tool on the MCP server
     */
    async callTool(toolName, toolArgs) {
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
        }
        catch (error) {
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
    async sendRequest(request) {
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
            // Send request via stdin.
            // MCP stdio transport uses Content-Length framing (LSP-style).
            const body = JSON.stringify(request);
            const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
            const payload = header + body;
            this.process.stdin.write(payload, (error) => {
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
    parseMCPMessages() {
        // Prefer Content-Length framing (MCP stdio / LSP-style)
        while (true) {
            const headerEnd = this.stdoutBuffer.indexOf('\r\n\r\n');
            if (headerEnd === -1)
                break;
            const headerBlock = this.stdoutBuffer.slice(0, headerEnd);
            const match = headerBlock.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                // If framing isn't present, fall back to line parsing below
                break;
            }
            const contentLength = Number.parseInt(match[1], 10);
            const messageStart = headerEnd + 4;
            const messageEnd = messageStart + contentLength;
            if (this.stdoutBuffer.length < messageEnd)
                break; // wait for full payload
            const body = this.stdoutBuffer.slice(messageStart, messageEnd);
            this.stdoutBuffer = this.stdoutBuffer.slice(messageEnd);
            try {
                const message = JSON.parse(body);
                this.handleMCPMessage(message);
            }
            catch {
                // ignore malformed payloads
            }
        }
        // Fallback: newline-delimited JSON (legacy / non-framed)
        if (this.stdoutBuffer.includes('\n') && !this.stdoutBuffer.includes('Content-Length:')) {
            const lines = this.stdoutBuffer.split('\n');
            this.stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const message = JSON.parse(line);
                    this.handleMCPMessage(message);
                }
                catch {
                    // ignore
                }
            }
        }
    }
    /**
     * Handle incoming MCP message (JSON-RPC response)
     */
    handleMCPMessage(message) {
        // Handle JSON-RPC response
        if (message.id && this.pendingRequests.has(message.id)) {
            const request = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            clearTimeout(request.timeout);
            if (message.error) {
                request.reject(new Error(message.error.message || 'MCP server error'));
            }
            else {
                request.resolve(message);
            }
        }
    }
    /**
     * Get next request ID
     */
    getNextRequestId() {
        return ++this.requestId;
    }
    /**
     * Get all cached tools
     */
    getTools() {
        return Array.from(this.tools.values());
    }
    /**
     * Check if tool exists
     */
    hasTool(toolName) {
        return this.tools.has(toolName);
    }
    /**
     * Disconnect from MCP server
     */
    async disconnect() {
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
    getConnectionStatus() {
        return this.isConnected && this.process !== null && !this.process.killed;
    }
}
exports.MCPClientAdapter = MCPClientAdapter;
// Global singleton instance (lazy initialization)
let _mcpClientAdapter = null;
const mcpClientAdapter = () => {
    if (!_mcpClientAdapter) {
        _mcpClientAdapter = new MCPClientAdapter();
    }
    return _mcpClientAdapter;
};
exports.mcpClientAdapter = mcpClientAdapter;
