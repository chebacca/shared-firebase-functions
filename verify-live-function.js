
const admin = require('firebase-admin');
const axios = require('axios');

async function testLiveFunction() {
    console.log('🚀 Starting live test of updateOAuthAccountInfo...');

    // 1. Initialize Firebase Admin
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: 'backbone-logic'
        });
    }

    const db = admin.firestore();
    const testOrgId = 'big-tree-productions';

    try {
        // 2. Get a user from the organization to simulate a call
        console.log(`🔍 Finding user in organization: ${testOrgId}`);
        const usersSnapshot = await db
            .collection('users')
            .where('organizationId', '==', testOrgId)
            .limit(1)
            .get();

        if (usersSnapshot.empty) {
            throw new Error(`No users found in organization ${testOrgId}`);
        }

        const userId = usersSnapshot.docs[0].id;
        const userEmail = usersSnapshot.docs[0].data().email;
        console.log(`✅ Found user: ${userEmail} (${userId})`);

        // 3. Create a custom token and sign in to get an ID token
        // Note: This requires the service account to have permission to create tokens
        console.log('🔑 Creating custom token...');
        const customToken = await admin.auth().createCustomToken(userId);

        // To get an ID token, we usually need the client SDK. 
        // Since we're server-side, we can use the Identity Toolkit API to exchange the custom token for an ID token.
        console.log('🎫 Exchanging custom token for ID token...');
        const apiKey = process.env.FIREBASE_API_KEY; // We'll try to find this or hope it's not strictly needed if we use service account auth

        // Actually, for Firebase Functions (onCall), we need a valid Authorization: Bearer <ID_TOKEN> and data in { data: ... }
        // If we don't have the ID token easily, we can try to find an existing one or just test the endpoint with a test tool.

        // Let's try to find if there's an API key in the environment or files
        console.log('📡 Calling function...');
        const functionUrl = 'https://us-central1-backbone-logic.cloudfunctions.net/updateOAuthAccountInfo';

        // We'll simulate the call. Since we are testing if it's "live" and responding, 
        // even a 401 or 403 (with a specific error message) would prove it's live and reaching my new code.
        // If it returns a 500 with my new error logging format, we'll see the Dropbox error.

        try {
            const response = await axios.post(functionUrl, {
                data: {
                    provider: 'dropbox',
                    organizationId: testOrgId
                }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    // No auth token for now, just to see if it reaches the function
                }
            });
            console.log('✅ Response:', response.data);
        } catch (error) {
            if (error.response) {
                console.log(`📡 Function replied with status ${error.response.status}`);
                console.log('📄 Response data:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error('❌ Error calling function:', error.message);
            }
        }

    } catch (error) {
        console.error('❌ Test script failed:', error.message);
    }
}

testLiveFunction();
