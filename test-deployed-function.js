#!/usr/bin/env node

/**
 * Test deployed callAIAgent Cloud Function directly
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'backbone-logic'
});

async function testDeployedFunction() {
    console.log('🧪 Testing deployed callAIAgent function...\n');

    try {
        // Get a test user token
        const auth = admin.auth();

        // Use the admin user
        const userEmail = 'admin.clipshow@example.com';
        console.log(`📧 Getting user: ${userEmail}`);

        const user = await auth.getUserByEmail(userEmail);
        console.log(`✅ Found user: ${user.uid}\n`);

        // Create a custom token
        const customToken = await auth.createCustomToken(user.uid);
        console.log('✅ Created custom token\n');

        // Sign in with the custom token to get an ID token
        const { initializeApp } = require('firebase/app');
        const { getAuth, signInWithCustomToken } = require('firebase/auth');

        const apiKey = process.env.FIREBASE_WEB_API_KEY;
        if (!apiKey) {
            console.error('❌ Error: FIREBASE_WEB_API_KEY environment variable not set');
            console.error('   Set it with: export FIREBASE_WEB_API_KEY=your_key_here');
            process.exit(1);
        }

        const app = initializeApp({
            apiKey: apiKey,
            authDomain: 'backbone-logic.firebaseapp.com',
            projectId: 'backbone-logic'
        });

        const clientAuth = getAuth(app);
        const userCredential = await signInWithCustomToken(clientAuth, customToken);
        const idToken = await userCredential.user.getIdToken();

        console.log('✅ Got ID token\n');

        // Call the function using the Firebase Functions SDK
        const { getFunctions, httpsCallable } = require('firebase/functions');
        const functions = getFunctions(app);

        const callAIAgent = httpsCallable(functions, 'callAIAgent');

        console.log('🚀 Calling callAIAgent function...\n');
        console.log('📝 Message: "Show me our media assets"\n');

        const result = await callAIAgent({
            agentId: 'master-agent',
            message: 'Show me our media assets',
            context: {
                activeMode: 'none'
            }
        });

        console.log('✅ Function call successful!\n');
        console.log('📦 Response:');
        console.log('─'.repeat(80));
        console.log(JSON.stringify(result.data, null, 2));
        console.log('─'.repeat(80));

        if (result.data.suggestedContext) {
            console.log(`\n🎯 Suggested Context: ${result.data.suggestedContext}`);
        }

        if (result.data.reasoning) {
            console.log(`💭 Reasoning: ${result.data.reasoning}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code) {
            console.error('Error code:', error.code);
        }
        if (error.details) {
            console.error('Error details:', error.details);
        }
    }

    process.exit(0);
}

testDeployedFunction();
