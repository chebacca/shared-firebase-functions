
const admin = require('firebase-admin');

// Initialize with Application Default Credentials
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: 'backbone-logic' // Explicitly set project ID
    });
}

const db = admin.firestore();
const organizationId = 'big-tree-productions'; // The org we know has data

async function testPWSWorkflowContext() {
    console.log('🧪 Testing PWS Workflow Context Service with ADC...');

    // Re-implementing the core logic from PWSWorkflowContextService here to test it directly
    // avoiding import issues with the compiled JS files

    const collectionsToQuery = ['sessionWorkflows', 'session_workflows', 'workflow-sessions'];
    const allSessions = [];

    console.log(`[Test] Querying multiple collections for org ${organizationId}: ${collectionsToQuery.join(', ')}`);

    for (const collectionName of collectionsToQuery) {
        try {
            console.log(`[Test] Querying ${collectionName}...`);

            const snapshot = await db.collection(collectionName)
                .where('organizationId', '==', organizationId)
                .where('status', 'in', ['ACTIVE', 'PENDING', 'active', 'pending', 'IN_PROGRESS', 'in_progress'])
                .limit(20)
                .get();

            if (!snapshot.empty) {
                console.log(`✅ [Test] Found ${snapshot.size} active sessions in ${collectionName}`);

                snapshot.docs.forEach(doc => {
                    const d = doc.data();
                    console.log(`   - ID: ${doc.id}`);
                    console.log(`     Name: ${d.name || d.workflowName || d.sessionName}`);
                    console.log(`     Status: ${d.status}`);

                    // Avoid duplicates
                    if (!allSessions.find(s => s.sessionId === (d.sessionId || doc.id))) {
                        allSessions.push({
                            sessionId: d.sessionId || doc.id,
                            sessionName: d.sessionName || d.name || 'Unnamed Session',
                            workflowName: d.workflowName || d.name || 'Unnamed Workflow',
                            status: d.status || 'PENDING',
                            progress: d.progress || 0,
                            stepCount: d.stepCount || 0,
                            completedSteps: d.completedSteps || 0
                        });
                    }
                });
            } else {
                console.log(`   [Test] No active sessions found in ${collectionName}`);
            }
        } catch (err) {
            console.warn(`⚠️ [Test] Error querying ${collectionName}:`, err.message);
        }
    }

    console.log(`\n🎉 Final Result: Found ${allSessions.length} unique session workflows.`);
}

testPWSWorkflowContext().catch(console.error);
