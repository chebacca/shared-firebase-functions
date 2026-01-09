/**
 * NUCLEAR OPTION: Clean up EVERYTHING related to Slack
 * - Connections
 * - Channels
 * - OAuh States
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function nuclearCleanup() {
    const orgId = 'big-tree-productions';
    console.log('☢️  STARTING NUCLEAR CLEANUP for org:', orgId);

    try {
        const batch = db.batch();
        let deleteCount = 0;

        // 1. Delete Connections
        const connectionsRef = db.collection('organizations').doc(orgId).collection('slackConnections');
        const connections = await connectionsRef.get();
        console.log(`🔌 Found ${connections.size} connections`);
        connections.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        // 2. Delete Channels
        const channelsRef = db.collection('organizations').doc(orgId).collection('slackChannels');
        const channels = await channelsRef.get();
        console.log(`📺 Found ${channels.size} channels`);
        channels.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        // 3. Delete OAuth States
        const statesRef = db.collection('slackOAuthStates');
        const states = await statesRef.get();
        console.log(`🔑 Found ${states.size} OAuth states`);
        states.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        if (deleteCount > 0) {
            await batch.commit();
            console.log(`✅ Successfully deleted ${deleteCount} documents.`);
        } else {
            console.log('✅ Nothing to clean up.');
        }

        console.log('\n✨ Database is CLEAN. Please Reconnect Slack now.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

nuclearCleanup();
