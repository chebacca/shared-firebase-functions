import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkSessionWorkflows() {
    console.log('Checking sessionWorkflows collection...');

    // Get all docs (limit 10) to see what they look like
    const snapshot = await db.collection('sessionWorkflows').limit(10).get();

    if (snapshot.empty) {
        console.log('No documents found in sessionWorkflows collection.');

        // Check if maybe it's under a subcollection?
        // But rules said match /sessionWorkflows/{workflowId} - so it's a root collection.
        return;
    }

    console.log(`Found ${snapshot.size} documents.`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Doc ID: ${doc.id}`);
        console.log(`  organizationId: ${data.organizationId}`);
        console.log(`  status: ${data.status}`);
        console.log(`  name: ${data.name || data.workflowName}`);
    });
}

checkSessionWorkflows().catch(console.error);
