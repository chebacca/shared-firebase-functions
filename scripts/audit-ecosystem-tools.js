const admin = require('firebase-admin');
const { MCPClientAdapter } = require('../lib/ai/MCPClientAdapter');
const { UnifiedToolRegistry } = require('../lib/ai/services/UnifiedToolRegistry');
const path = require('path');
const fs = require('fs');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

async function auditEcosystemTools() {
    console.log('🔍 Auditing Entire Backbone AI Tool Ecosystem\n');

    try {
        const mcpDistPath = '/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/_backbone_mcp_server/dist/index.js';
        console.log(`📡 Targeting MCP Server at: ${mcpDistPath}`);

        if (!fs.existsSync(mcpDistPath)) {
            console.error('❌ MCP Dist path NOT FOUND!');
            return;
        }

        // Initialize registry
        const registry = new UnifiedToolRegistry();

        // HACK: In the built Registry, it gets mcpClientAdapter() from the singleton.
        // We need to ensure that singleton uses our path.
        const { mcpClientAdapter } = require('../lib/ai/MCPClientAdapter');
        const client = mcpClientAdapter();
        // Manually set the path on the singleton BEFORE registry uses it
        client.mcpServerPath = mcpDistPath;

        console.log('📡 Connecting to MCP Server and discovering tools...');

        // Initialize and load
        await registry.getAllTools(); // This triggers initialization

        const allTools = await registry.getAllTools();
        const toolsBySource = await registry.getToolsBySource();
        const categories = await registry.getToolsByCategory();

        console.log('\n📊 Ecosystem Tool Report:');
        console.log('-------------------------');
        console.log(`✅ Total Tools Registered: ${allTools.length}`);
        console.log(`   - from MCP Server: ${toolsBySource.mcp.length}`);
        console.log(`   - from Shared Intelligence: ${toolsBySource.shared.length}`);
        console.log('');

        console.log('📁 Tools by Category:');
        Object.entries(categories).forEach(([cat, tools]) => {
            console.log(`   - ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${tools.length}`);
        });

        console.log('\n📝 Sample of Registered Tools:');
        allTools.slice(0, 10).forEach(t => {
            console.log(`   [${t.source.toUpperCase()}] ${t.name}`);
        });
        console.log('   ... and ' + (allTools.length - 10) + ' more.');

        // Verify some specific high-value tools
        const checkList = [
            'get_project_data',
            'query_firestore',
            'create_session',
            'onboard_team_member',
            'security_check_in_visitor',
            'approve_timecard'
        ];

        console.log('\n✅ Verifying critical tool presence:');
        for (const toolName of checkList) {
            const exists = await registry.hasTool(toolName);
            console.log(`   - ${toolName}: ${exists ? '✅ Found' : '❌ MISSING'}`);
        }

        if (allTools.length > 300) {
            console.log('\n🌟 SUCCESS: Tool coverage is comprehensive (> 300 tools found).');
        } else {
            console.log('\n⚠️  WARNING: Tool count is lower than expected based on file system audit.');
        }

    } catch (error) {
        console.error('\n❌ Audit Failed:', error);
    }
}

auditEcosystemTools();
