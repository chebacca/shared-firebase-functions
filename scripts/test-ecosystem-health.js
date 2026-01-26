const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Pure Source Code Audit for Tool Health
 * This avoids the MCP connection loop by auditing the source files directly.
 */

async function runSourceAudit() {
    console.log('🛡️  Starting Backbone Source-Level Tool Audit\n');

    const mcpToolsDir = '/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/_backbone_mcp_server/src/tools';
    const sharedToolsDir = '/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/shared-backbone-intelligence/src/tools';

    const results = {
        total: 0,
        mcp: { total: 0, healthy: 0, issues: [] },
        shared: { total: 0, healthy: 0, issues: [] },
        collisions: new Map()
    };

    function auditDir(dir, sourceKey) {
        const files = glob.sync('**/*.ts', { cwd: dir, absolute: true });

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');

            // Extract tool name from the exported object (heuristic)
            const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
            const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/s);
            const schemaMatch = content.match(/parameters:|inputSchema:/);

            if (nameMatch) {
                const name = nameMatch[1];
                results.total++;
                results[sourceKey].total++;

                // Collision Detection
                if (results.collisions.has(name)) {
                    results.collisions.get(name).push(sourceKey);
                } else {
                    results.collisions.set(name, [sourceKey]);
                }

                const issues = [];
                if (!descMatch) issues.push('Missing description');
                else if (descMatch[1].length < 20) issues.push('Description too short');

                if (!schemaMatch) issues.push('No schema detected');

                if (issues.length === 0) {
                    results[sourceKey].healthy++;
                } else {
                    results[sourceKey].issues.push({ name, file: path.basename(file), issues });
                }
            }
        }
    }

    console.log('📂 Auditing MCP Tools...');
    auditDir(mcpToolsDir, 'mcp');

    console.log('📂 Auditing Shared Intelligence Tools...');
    auditDir(sharedToolsDir, 'shared');

    console.log('\n📊 AUDIT SUMMARY:');
    console.log('-----------------------');
    console.log(`✅ Total Tools Found: ${results.total}`);
    console.log(`   - MCP:    ${results.mcp.total} (${results.mcp.healthy} healthy)`);
    console.log(`   - Shared: ${results.shared.total} (${results.shared.healthy} healthy)`);

    const duplicates = Array.from(results.collisions.entries()).filter(([k, v]) => v.length > 1);
    console.log(`\n🚫 Collisions: ${duplicates.length}`);
    duplicates.forEach(([name, sources]) => {
        console.log(`   - ${name} (In: ${sources.join(', ')})`);
    });

    console.log('\n⚠️  TOP METADATA ISSUES:');
    const allIssues = [...results.mcp.issues, ...results.shared.issues];
    allIssues.slice(0, 15).forEach(i => {
        console.log(`   - ${i.name} (${i.file}): ${i.issues.join(', ')}`);
    });

    const totalHealthy = results.mcp.healthy + results.shared.healthy;
    const score = ((totalHealthy / results.total) * 100).toFixed(1);
    console.log(`\n🌟 ECOSYSTEM READINESS SCORE: ${score}%`);

    process.exit(0);
}

runSourceAudit().catch(console.error);
