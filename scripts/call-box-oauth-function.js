/**
 * Call the existing handleBoxOAuthCallback Firebase Function
 * This uses the deployed function which handles encryption/decryption properly
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = require('../firebase-clipshow.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || serviceAccount.projectId || 'backbone-logic'
    });
  } catch (error) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'backbone-logic'
    });
  }
}

const code = process.argv[2];
const state = process.argv[3];

if (!code || !state) {
  console.error('❌ Usage: node scripts/call-box-oauth-function.js <code> <state>');
  process.exit(1);
}

async function callBoxOAuthFunction() {
  try {
    // Get auth token for calling the function
    const customToken = await admin.auth().createCustomToken('system');
    const idToken = customToken; // For callable functions, we need the actual user's ID token
    
    // Actually, we need to call it as the user who initiated OAuth
    // Get user from state document
    const db = admin.firestore();
    const stateDoc = await db.collection('oauthStates').doc(state).get();
    
    if (!stateDoc.exists) {
      console.error('❌ State not found');
      process.exit(1);
    }
    
    const stateData = stateDoc.data();
    const userId = stateData.userId;
    
    // Create a custom token for the user
    const userToken = await admin.auth().createCustomToken(userId);
    
    // Call the function via HTTP (since it's a callable function)
    const projectId = admin.app().options.projectId;
    const functionUrl = `https://us-central1-${projectId}.cloudfunctions.net/handleBoxOAuthCallback`;
    
    console.log('🔄 Calling Firebase Function:', functionUrl);
    
    // For callable functions, we need to use the Firebase Functions SDK
    // But since we're in a script, let's use HTTP with proper auth
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        data: { code, state }
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.error('❌ Function error:', result.error);
      process.exit(1);
    }
    
    console.log('✅ Success!', result);
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

callBoxOAuthFunction();
