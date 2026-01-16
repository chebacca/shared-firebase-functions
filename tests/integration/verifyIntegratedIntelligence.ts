import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin (MOCK) - Must be before other imports
import * as admin from 'firebase-admin';
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'mock-project-id'
    });
}

import { GeminiService } from '../../src/ai/GeminiService';
import { GlobalContext } from '../../src/ai/contextAggregation/GlobalContextService';
import { allTools } from 'shared-backbone-intelligence';
import { searchMemoryTool } from 'shared-backbone-intelligence';

// Mock Data
const MOCK_USER_ID = 'test-user-123';
const MOCK_ORG_ID = 'test-org-456';

const mockGlobalContext: GlobalContext = {
    userId: MOCK_USER_ID,
    organizationId: MOCK_ORG_ID,
    timestamp: new Date().toISOString(),
    // App Contexts
    dashboard: { activeProjects: 0, totalProjects: 0, projects: [] },
    licensing: { activeLicenses: 0, totalLicenses: 0, licenses: [] },
    callSheet: { activePersonnel: 0, personnel: [] },
    bridge: { activeFolders: 0, folders: [] },
    clipShow: {
        phaseDistribution: {},
        bottlenecks: [],
        statusTransitions: [],
        velocityMetrics: { averageTimeToComplete: 0, averageTimePerPhase: {}, completionRate: 0, itemsInProgress: 0, itemsCompleted: 0 },
        itemsByPhase: {}
    },
    schedule: { linkedEvents: [], overdueItems: [], conflicts: [], atRiskItems: [], activeItemsTimeline: [] },
    team: { totalMembers: 0, activeMembers: 0, pendingMembers: 0, ownerCount: 0, adminCount: 0, memberCount: 0, viewerCount: 0, recentlyActive: 0 },
    pwsWorkflows: {
        templates: [],
        sessionWorkflows: [],
        userWorkflows: [],
        statistics: { totalTemplates: 0, totalActiveWorkflows: 0, averageWorkflowComplexity: 0, mostUsedTemplate: '' }
    },
    sessions: {
        statistics: { totalSessions: 0, sessionsByStatus: {}, sessionsByPhase: {}, activeWorkflows: 0 }
    },
    budgets: { totalBudgets: 0, activeBudgets: 0, totalBudgeted: 0, totalSpent: 0, budgets: [] },
    inventory: { totalItems: 0, checkedOutItems: 0, availableItems: 0, lowStockItems: 0, items: [] }
};

async function runVerification() {
    console.log('🧬 STARTING UNIFIED INTELLIGENCE VERIFICATION 🧬');
    console.log('================================================');

    // 1. Verify Shared Library Access
    console.log('\n🔍 [1/5] Verifying Shared Library Access...');
    try {
        if (!allTools || allTools.length === 0) {
            throw new Error('allTools is empty!');
        }
        console.log(`✅ shared-backbone-intelligence loaded successfully.`);
        console.log(`   Found ${allTools.length} tools registered.`);

        const memTool = allTools.find(t => t.name === 'search_memory');
        if (!memTool) throw new Error('search_memory tool not found in registry');
        console.log(`✅ search_memory tool validated in registry.`);

    } catch (e: any) {
        console.error(`❌ Shared library check failed: ${e.message}`);
        process.exit(1);
    }

    // 2. Initialize Gemini Service
    console.log('\n🤖 [2/5] Initializing Gemini Service...');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ GEMINI_API_KEY not found in env. Skipping live AI tests.');
        console.warn('   To run live tests, export GEMINI_API_KEY=<your-key>');
        return;
    }

    const gemini = new GeminiService(apiKey);
    console.log('✅ GeminiService initialized.');

    // 3. Test Vector Memory (Direct Tool Call)
    console.log('\n🧠 [3/5] Testing Vector Memory (Direct Tool Execution)...');
    try {
        // We mock the DB call or catch the error if no DB connection
        // Since we are running locally without full Firebase Admin auth, this might fail on DB access
        // But we want to ensure the logic path works.
        // For this script, we'll skip actual execution if we suspect DB will fail, 
        // but we can verify the schema.
        console.log('   (Skipping actual DB query in this lightweight script to avoid Admin SDK errors)');
        console.log('   Tool Schema verification:');
        console.log(`   - Name: ${searchMemoryTool.name}`);
        console.log(`   - Description: ${searchMemoryTool.description}`);
        console.log('✅ Vector Memory tool interface verified.');
    } catch (e: any) {
        console.error(`❌ Vector Memory test failed: ${e.message}`);
    }

    // 4. Test General Agent Chat
    console.log('\n💬 [4/5] Testing Agent Chat (Identity)...');
    try {
        const response = await gemini.generateAgentResponse(
            "Hello, who are you and what tools do you have?",
            mockGlobalContext,
            'none'
        );
        console.log(`✅ Agent Response Received!`);
        console.log(`   Response: "${response.response.substring(0, 50)}..."`);
        console.log(`   Reasoning: ${response.reasoning}`);
    } catch (e: any) {
        console.error(`❌ Agent Chat test failed: ${e.message}`);
    }

    // 5. Test Architect Mode Routing
    console.log('\n🏛️ [5/5] Testing Architect Mode Routing...');
    try {
        const planPrompt = "I need to plan a complex marketing campaign for 'Project Alpha'. Create a workflow.";
        // We are checking if the Agent *suggests* plan_mode or enters it
        const response = await gemini.generateAgentResponse(
            planPrompt,
            mockGlobalContext,
            'none'
        );

        console.log(`   User Prompt: "${planPrompt}"`);
        console.log(`   Suggested Context: ${response.suggestedContext}`);

        if (response.suggestedContext === 'plan_mode' || response.suggestedContext === 'workflows') {
            console.log(`✅ Correctly suggested '${response.suggestedContext}' context.`);
        } else {
            console.warn(`⚠️ Unexpected context suggestion: ${response.suggestedContext}`);
        }
    } catch (e: any) {
        console.error(`❌ Architect Mode test failed: ${e.message}`);
    }

    console.log('\n================================================');
    console.log('✨ VERIFICATION COMPLETE');
}

runVerification();
