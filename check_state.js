
const admin = require('firebase-admin');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (assumes GOOGLE_APPLICATION_CREDENTIALS or default auth)
if (admin.apps.length === 0) {
    initializeApp();
}

const db = getFirestore();

async function checkState(stateToCheck) {
    console.log(`Checking state: ${stateToCheck}`);

    // 1. Check oauthStates by ID
    const docRef = db.collection('oauthStates').doc(stateToCheck);
    const doc = await docRef.get();
    if (doc.exists) {
        console.log('✅ Found in oauthStates (by ID):', doc.data());
        return;
    } else {
        console.log('❌ Not found in oauthStates (by ID)');
    }

    // 2. Check oauthStates by field
    const query1 = await db.collection('oauthStates').where('state', '==', stateToCheck).get();
    if (!query1.empty) {
        console.log('✅ Found in oauthStates (by query):', query1.docs[0].data());
        return;
    } else {
        console.log('❌ Not found in oauthStates (by query)');
    }

    // 3. Check dropboxOAuthStates
    const query2 = await db.collection('dropboxOAuthStates').where('state', '==', stateToCheck).get();
    if (!query2.empty) {
        console.log('✅ Found in dropboxOAuthStates:', query2.docs[0].data());
        return;
    } else {
        console.log('❌ Not found in dropboxOAuthStates');
    }
}

const state = 'ffebff9ebc83ea49a2fcfd12610914e72c35c9ac0c11df12e14f09edffb70997'; // From user message
checkState(state);
