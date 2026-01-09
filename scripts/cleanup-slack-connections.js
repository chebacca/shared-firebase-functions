/**
 * Clean up all Slack connections for an organization
 * This ensures a single source of truth
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function cleanupSlackConnections() {
    const orgId = 'big-tree-productions';

    try {
        console.log('🔍 Finding all Slack connections for org:', orgId);

        const connectionsRef = db
            .collection('organizations')
            .doc(orgId)
            .collection('slackConnections');

        const snapshot = await connectionsRef.get();

        console.log(`📊 Found ${snapshot.size} Slack connection(s)`);

        if (snapshot.empty) {
            console.log('✅ No Slack connections to clean up');
            process.exit(0);
        }

        // List all connections
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`  - ${doc.id}: ${data.workspaceName || 'Unknown'} (created: ${data.createdAt?.toDate?.() || 'unknown'})`);
        });

        // Delete all connections
        console.log('\n🗑️ Deleting all Slack connections...');
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        console.log(`✅ Deleted ${snapshot.size} Slack connection(s)`);
        console.log('\n🔄 Now reconnect Slack from the Licensing Website to create a fresh connection with unified encryption.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error cleaning up Slack connections:', error);
        process.exit(1);
    }
}

cleanupSlackConnections();
