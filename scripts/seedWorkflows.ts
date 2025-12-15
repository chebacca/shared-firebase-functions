/**
 * Seed Workflows Script
 * Creates workflow instances for existing sessions that don't have workflows
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../backbone-logic-firebase-adminsdk-fbsvc-3db30f4742.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://backbone-logic.firebaseio.com'
});

const db = admin.firestore();

interface SessionData {
    id: string;
    name: string;
    organizationId: string;
    projectId: string;
    status?: string;
    createdAt?: admin.firestore.Timestamp;
}

async function seedWorkflowsForSessions() {
    console.log('🚀 Starting workflow seeding process...\n');

    try {
        // Get all sessions for the organization
        const sessionsSnapshot = await db.collection('sessions')
            .where('organizationId', '==', 'clip-show-pro-productions')
            .get();

        console.log(`📊 Found ${sessionsSnapshot.size} sessions in organization\n`);

        let createdCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const sessionDoc of sessionsSnapshot.docs) {
            const sessionData = sessionDoc.data() as SessionData;
            const sessionId = sessionDoc.id;

            console.log(`\n🔍 Processing session: ${sessionId}`);
            console.log(`   Name: ${sessionData.name}`);

            try {
                // Check if session already has workflows
                const existingWorkflows = await db.collection('sessionWorkflows')
                    .where('sessionId', '==', sessionId)
                    .get();

                if (!existingWorkflows.empty) {
                    console.log(`   ⏭️  Skipped - already has ${existingWorkflows.size} workflow(s)`);
                    skippedCount++;
                    continue;
                }

                // Create default Production workflow for session
                const workflowData = {
                    sessionId,
                    organizationId: sessionData.organizationId,
                    projectId: sessionData.projectId || '',
                    workflowPhase: 'PRODUCTION',
                    name: `${sessionData.name} - Production Workflow`,
                    description: `Production workflow for ${sessionData.name}`,
                    status: 'not_started',
                    progress: 0,
                    stepsCount: 0,
                    completedSteps: 0,
                    inProgressSteps: 0,
                    blockedSteps: 0,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdBy: 'system',
                    workflowSteps: [],
                    workflowAssignments: []
                };

                await db.collection('sessionWorkflows').add(workflowData);
                console.log(`   ✅ Created Production workflow`);
                createdCount++;

            } catch (error) {
                console.error(`   ❌ Error processing session ${sessionId}:`, error);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 Workflow Seeding Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Created: ${createdCount} workflows`);
        console.log(`⏭️  Skipped: ${skippedCount} sessions (already have workflows)`);
        console.log(`❌ Errors: ${errorCount} sessions`);
        console.log(`📊 Total Sessions Processed: ${sessionsSnapshot.size}`);
        console.log('='.repeat(60) + '\n');

        console.log('✨ Workflow seeding completed!\n');

    } catch (error) {
        console.error('❌ Fatal error during workflow seeding:', error);
        process.exit(1);
    }
}

// Run the seeding function
seedWorkflowsForSessions()
    .then(() => {
        console.log('🎉 Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
