const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(__dirname, '../config/credentials/firebase-adminsdk-key.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'backbone-logic'
});

async function testMasterAgentV2() {
    console.log('🧪 Testing deployed masterAgentV2 function...\n');

    try {
        // Use a real user from the project
        const userEmail = 'chebacca@gmail.com';
        console.log(`📧 Getting user: ${userEmail}`);

        const user = await admin.auth().getUserByEmail(userEmail);
        console.log(`✅ Found user: ${user.uid}\n`);

        // Create a custom token
        const customToken = await admin.auth().createCustomToken(user.uid);
        console.log('✅ Created custom token\n');

        // Exchange custom token for ID token via REST API
        // This avoids needing the full Firebase client SDK in this script
        const apiKey = 'AIzaSyB3Dqy1OHVQp9rEsaolHJxTfDZV5N8hUvk'; // From .env
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;

        const signInResponse = await axios.post(url, {
            token: customToken,
            returnSecureToken: true
        });

        const idToken = signInResponse.data.idToken;
        console.log('✅ Got ID token\n');

        // Call the function via HTTPS (MasterAgentV2 is a callable function)
        const functionUrl = 'https://us-central1-backbone-logic.cloudfunctions.net/masterAgentV2';

        console.log('🚀 Calling masterAgentV2 function...\n');
        const message = 'Hello, who are you and what can you do?';
        console.log(`📝 Message: "${message}"\n`);

        const requestBody = {
            data: {
                message: message,
                activeMode: 'none',
                organizationId: 'big-tree-productions',
                userId: user.uid,
                projectId: 'big-tree-la-event-global',
                sessionId: `test-session-${Date.now()}`
            }
        };

        const response = await axios.post(functionUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Function call successful!\n');
        console.log('📦 Response Summary:');
        console.log('─'.repeat(40));

        const result = response.data.result;
        if (result) {
            console.log(`Success: ${result.success}`);
            console.log(`Agent: ${result.agent}`);
            console.log(`Response: ${result.response?.substring(0, 1000)}${result.response?.length > 1000 ? '...' : ''}`);
            if (result.routing) {
                console.log(`Routing Reasoning: ${result.routing.reasoning}`);
            }
        } else {
            console.log('No result in response body:');
            console.log(JSON.stringify(response.data, null, 2));
        }
        console.log('─'.repeat(40));

    } catch (error) {
        console.error('❌ Error testing function:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }

    process.exit(0);
}

testMasterAgentV2();
