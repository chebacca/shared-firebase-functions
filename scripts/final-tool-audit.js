const admin = require('firebase-admin');
const { UnifiedToolRegistry } = require('../lib/ai/services/UnifiedToolRegistry');
const { mcpClientAdapter } = require('../lib/ai/MCPClientAdapter');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

async function finalVerification() {
    const mcpDistPath = '/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/_backbone_mcp_server/dist/index.js';
    const client = mcpClientAdapter();
    client.mcpServerPath = mcpDistPath;

    const registry = new UnifiedToolRegistry();
    console.log('📡 Starting final tool discovery...');

    // Trigger discovery
    const tools = await registry.getAllTools();

    console.log(`\n✅ TOTAL TOOLS REGISTERED: ${tools.length}`);
    const mcpCount = tools.filter(t => t.source === 'mcp').length;
    const sharedCount = tools.filter(t => t.source === 'shared').length;

    console.log(`   - MCP Tools: ${mcpCount}`);
    console.log(`   - Shared Tools: ${sharedCount}`);

    // Categorization
    const cats = {
        core: tools.filter(t => t.name.includes('project') || t.name.includes('task') || t.name.includes('team')).length,
        production: tools.filter(t => t.name.includes('session') || t.name.includes('callsheet') || t.name.includes('timecard')).length,
        security: tools.filter(t => t.name.includes('security') || t.name.includes('visitor')).length,
        iwm: tools.filter(t => t.name.includes('inventory')).length,
        discovery: tools.filter(t => t.name.includes('query') || t.name.includes('search')).length
    };

    console.log('\n📁 Coverage by Area:');
    Object.entries(cats).forEach(([name, count]) => {
        console.log(`   - ${name.toUpperCase()}: ${count} tools`);
    });

    process.exit(0);
}

finalVerification();
