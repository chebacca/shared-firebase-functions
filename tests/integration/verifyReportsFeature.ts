import * as dotenv from 'dotenv';
import * as admin from 'firebase-admin';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin (MOCK)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

import { GeminiService } from '../../src/ai/GeminiService';
import { GlobalContext } from '../../src/ai/contextAggregation/GlobalContextService';

async function verifyReportsFeature() {
    console.log('📊 VERIFYING INTELLIGENCE REPORTS FEATURE 📊');
    console.log('============================================');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found in env. Cannot run test.');
        return;
    }

    const gemini = new GeminiService(apiKey);

    const mockGlobalContext: GlobalContext = {
        userId: 'test-user-123',
        organizationId: 'big-tree-productions',
        timestamp: new Date().toISOString(),
        dashboard: {
            activeProjects: 2,
            totalProjects: 5,
            projects: [
                { id: 'proj-1', name: 'Coffee Shop Commercial', status: 'active', client: 'Starbucks', updatedAt: '', createdAt: '' },
                { id: 'proj-2', name: 'Documentary Feature', status: 'active', client: 'Netflix', updatedAt: '', createdAt: '' }
            ]
        },
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

    // Test 1: Auto-routing to Architect for report requests
    console.log('\n🔍 [1/2] Testing Auto-routing to Architect for Reports...');
    try {
        const reportPrompt = "Analyze the health of my current project ecosystem and give me a full report with metrics.";

        const response = await gemini.generateAgentResponse(
            reportPrompt,
            mockGlobalContext,
            'none'
        );

        console.log(`✅ Response received!`);
        console.log(`   Suggested Context: ${response.suggestedContext}`);

        if (response.suggestedContext === 'reports') {
            console.log('✅ Correctly suggested "reports" context via Architect routing.');
        } else {
            console.warn(`⚠️ Warning: Agent suggested "${response.suggestedContext}" instead of "reports".`);
        }

        if (response.contextData && (response.contextData.executiveSummary || response.contextData.sections)) {
            console.log('✅ contextData contains report fields.');
            console.log(`   Title: ${response.contextData.title}`);
        } else {
            console.warn('⚠️ Warning: contextData is missing expected report fields.');
            console.log('   Raw contextData:', JSON.stringify(response.contextData, null, 2));
        }

    } catch (e: any) {
        console.error(`❌ Auto-routing test failed: ${e.message}`);
    }

    // Test 2: Specific Outlook Analysis
    console.log('\n🔍 [2/2] Testing Outlook/Strategic Analysis...');
    try {
        const outlookPrompt = "Give me a speculative outlook for my organization's performance in the next quarter.";

        const response = await gemini.generateAgentResponse(
            outlookPrompt,
            mockGlobalContext,
            'none'
        );

        console.log(`✅ Response received!`);
        console.log(`   Suggested Context: ${response.suggestedContext}`);

        if (response.contextData && response.contextData.outlook) {
            console.log('✅ Outlook section generated!');
            console.log(`   Outlook sample: "${response.contextData.outlook.substring(0, 100)}..."`);
        } else {
            console.warn('⚠️ Warning: Outlook section missing in report data.');
            console.log('   Raw contextData:', JSON.stringify(response.contextData, null, 2));
        }

    } catch (e: any) {
        console.error(`❌ Outlook test failed: ${e.message}`);
    }

    console.log('\n============================================');
    console.log('✨ REPORT FEATURE VERIFICATION COMPLETE');
}

verifyReportsFeature().catch(console.error);
