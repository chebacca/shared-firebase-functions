import * as admin from 'firebase-admin';

// Initialize with default credentials
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function listCollections() {
    console.log('Listing collections...');
    const collections = await db.listCollections();

    if (collections.length === 0) {
        console.log('No collections found.');
        return;
    }

    for (const col of collections) {
        console.log(` - ${col.id}`);

        // If it looks like a workflow collection, inspect one doc
        if (col.id.toLowerCase().includes('workflow') || col.id.toLowerCase().includes('session')) {
            const snapshot = await col.limit(1).get();
            if (!snapshot.empty) {
                console.log(`   Sample doc from ${col.id}:`, JSON.stringify(snapshot.docs[0].data(), null, 2));
            } else {
                console.log(`   (Empty collection)`);
            }
        }
    }
}

listCollections().catch(console.error);
