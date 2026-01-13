
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkState(stateToCheck) {
    console.log(`Checking state: ${stateToCheck}`);

    // 1. Check oauthStates by ID
    const docRef = db.collection('oauthStates').doc(stateToCheck);
    const doc = await docRef.get();
    if (doc.exists) {
        console.log('✅ Found in oauthStates (by ID):', doc.data());
    } else {
        console.log('❌ Not found in oauthStates (by ID)');
    }

    // 2. Check oauthStates by field
    const query1 = await db.collection('oauthStates').where('state', '==', stateToCheck).get();
    if (!query1.empty) {
        console.log('✅ Found in oauthStates (by query):', query1.docs[0].data());
    } else {
        console.log('❌ Not found in oauthStates (by query)');
    }

    // 3. Check dropboxOAuthStates
    const query2 = await db.collection('dropboxOAuthStates').where('state', '==', stateToCheck).get();
    if (!query2.empty) {
        console.log('✅ Found in dropboxOAuthStates:', query2.docs[0].data());
    } else {
        console.log('❌ Not found in dropboxOAuthStates');
    }
}

const state = '13e44ef9125976ad6f52ada1f9d484529f62f3e12e73cb2d47ecbf3ef9c1310a';
checkState(state);
