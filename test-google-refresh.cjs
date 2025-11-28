#!/usr/bin/env node

/**
 * Test script to verify refreshGoogleAccessTokenCallable function
 * 
 * Usage:
 *   node test-google-refresh.cjs
 * 
 * Or with Firebase token:
 *   export FIREBASE_TOKEN="your_token_here"
 *   node test-google-refresh.cjs
 */

const https = require('https');

const PROJECT_ID = 'backbone-logic';
const FUNCTION_NAME = 'refreshGoogleAccessTokenCallable';
const REGION = 'us-central1';
const FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${FUNCTION_NAME}`;

// Get Firebase token from environment or prompt
const FIREBASE_TOKEN = process.env.FIREBASE_TOKEN;

if (!FIREBASE_TOKEN) {
  console.error('❌ FIREBASE_TOKEN environment variable is required');
  console.log('\nTo get your Firebase token:');
  console.log('1. Open your app in the browser');
  console.log('2. Open browser DevTools (F12)');
  console.log('3. Go to Console tab');
  console.log('4. Run: firebase.auth().currentUser.getIdToken().then(t => console.log(t))');
  console.log('5. Copy the token and run: export FIREBASE_TOKEN="your_token_here"');
  process.exit(1);
}

console.log('🔍 Testing refreshGoogleAccessTokenCallable function...\n');
console.log(`📍 Function URL: ${FUNCTION_URL}`);
console.log(`🔑 Using Firebase token: ${FIREBASE_TOKEN.substring(0, 20)}...\n`);

// Make the function call
const postData = JSON.stringify({});

const options = {
  hostname: `${REGION}-${PROJECT_ID}.cloudfunctions.net`,
  path: `/${FUNCTION_NAME}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': `Bearer ${FIREBASE_TOKEN}`
  }
};

console.log('📤 Sending request...\n');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📥 Response Status: ${res.statusCode} ${res.statusMessage}`);
    console.log(`📋 Response Headers:`, res.headers);
    console.log('\n📄 Response Body:');
    
    try {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));
      
      if (response.success) {
        console.log('\n✅ SUCCESS: Token refresh completed successfully!');
      } else {
        console.log('\n❌ ERROR: Token refresh failed');
        console.log(`   Error: ${response.error || 'Unknown error'}`);
        console.log(`   Details: ${response.errorDetails || 'No details'}`);
        
        // Check for specific error types
        if (response.errorDetails?.includes('invalid_client')) {
          console.log('\n🔍 DIAGNOSIS: OAuth client configuration issue');
          console.log('   - The OAuth client credentials don\'t match Google Cloud Console');
          console.log('   - OR the refresh token was issued for a different OAuth client');
          console.log('   - Solution: Disconnect and reconnect Google Drive to get a new refresh token');
        } else if (response.errorDetails?.includes('invalid_grant')) {
          console.log('\n🔍 DIAGNOSIS: Refresh token is invalid or expired');
          console.log('   - The refresh token has been revoked or expired');
          console.log('   - Solution: Disconnect and reconnect Google Drive to get a new refresh token');
        }
      }
    } catch (e) {
      console.log('Raw response:', data);
      console.error('\n❌ Failed to parse response:', e.message);
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request failed:', error);
  console.error('   Make sure you have internet connectivity');
  console.error('   And that the function is deployed correctly');
});

req.write(postData);
req.end();

