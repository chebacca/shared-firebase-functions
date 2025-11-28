const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin SDK
initializeApp();
const auth = getAuth();

async function testInitiateGoogleOAuth() {
  const firebaseToken = process.env.FIREBASE_TOKEN;
  if (!firebaseToken) {
    console.error('Error: FIREBASE_TOKEN environment variable is not set.');
    console.error('Please get a Firebase ID token from your authenticated browser session:');
    console.error('  firebase.auth().currentUser.getIdToken().then(t => console.log(t))');
    console.error('  export FIREBASE_TOKEN="your_token_here"');
    process.exit(1);
  }

  try {
    // Verify the token to get the user ID
    const decodedToken = await auth.verifyIdToken(firebaseToken);
    const userId = decodedToken.uid;
    const organizationId = decodedToken.organizationId || 'default';

    console.log(`Testing initiateGoogleOAuthHttp for user: ${userId}, org: ${organizationId}`);

    // Call the HTTP function
    const functionUrl = 'https://us-central1-backbone-logic.cloudfunctions.net/initiateGoogleOAuthHttp';
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Function call failed: ${response.status} ${response.statusText}`);
      console.error('Response:', errorText);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log('✅ Function call successful!');
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.success && result.authUrl && result.state) {
      console.log('\n✅ OAuth initiation successful!');
      console.log(`State: ${result.state}`);
      console.log(`Auth URL: ${result.authUrl.substring(0, 100)}...`);
    } else {
      console.error('❌ Unexpected response format');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error testing function:', error);
    process.exit(1);
  }
}

testInitiateGoogleOAuth();
